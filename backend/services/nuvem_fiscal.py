"""Integração com Nuvem Fiscal API — OAuth2, emissão NFS-e, consulta e PDF."""

import asyncio
import time
from datetime import date, datetime, timezone, timedelta

import httpx

# Fuso horário de Brasília (UTC-3)
BRT = timezone(timedelta(hours=-3))
from sqlalchemy.orm import Session

from backend.models.nfse import Nfse
from backend.models.prestador import PrestadorConfig
from backend.models.tomador import Tomador
from backend.models.xml_log import XmlLog

# ============================================
# CONFIGURAÇÃO
# ============================================

AUTH_URL = "https://auth.nuvemfiscal.com.br/oauth/token"
API_URLS = {
    "producao": "https://api.nuvemfiscal.com.br",
    "homologacao": "https://api.sandbox.nuvemfiscal.com.br",
}
SCOPE = "empresa nfse cep"

# Cache do token em memória
_token_cache = {"access_token": None, "expires_at": 0}


# ============================================
# AUTH — OAuth2 client_credentials
# ============================================

async def _get_token(client_id: str, client_secret: str, ambiente: str = "homologacao") -> str:
    """Obtém token OAuth2, usando cache quando possível."""
    # Invalida cache se o ambiente mudou
    cached_amb = _token_cache.get("ambiente")
    if cached_amb and cached_amb != ambiente:
        _token_cache["access_token"] = None
        _token_cache["expires_at"] = 0

    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    # Audience determina se o token é para sandbox ou produção
    audience = API_URLS.get(ambiente, API_URLS["homologacao"]) + "/"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(AUTH_URL, data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": SCOPE,
            "audience": audience,
        })
        resp.raise_for_status()
        data = resp.json()
        _token_cache["access_token"] = data["access_token"]
        _token_cache["ambiente"] = ambiente
        _token_cache["expires_at"] = time.time() + data.get("expires_in", 3600)
        return data["access_token"]


def _get_nuvem_config(config: PrestadorConfig) -> dict | None:
    """Extrai credenciais Nuvem Fiscal do config do prestador."""
    cid = getattr(config, "nuvem_fiscal_client_id", "") or ""
    csecret = getattr(config, "nuvem_fiscal_client_secret", "") or ""
    if not cid or not csecret:
        return None
    env = getattr(config, "nuvem_fiscal_ambiente", "homologacao") or "homologacao"
    return {
        "client_id": cid,
        "client_secret": csecret,
        "ambiente": env.lower(),
        "base_url": API_URLS.get(env.lower(), API_URLS["homologacao"]),
    }


async def _authed_client(config: PrestadorConfig) -> tuple[httpx.AsyncClient, str]:
    """Retorna httpx client com headers de auth."""
    nuvem = _get_nuvem_config(config)
    if not nuvem:
        raise ValueError("Credenciais Nuvem Fiscal não configuradas.")
    token = await _get_token(nuvem["client_id"], nuvem["client_secret"], nuvem["ambiente"])
    base_url = nuvem["base_url"]
    return base_url, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============================================
# CADASTRO DE EMPRESA
# ============================================

async def cadastrar_empresa(db: Session) -> dict:
    """Cadastra/atualiza empresa na Nuvem Fiscal a partir do PrestadorConfig."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Configuração do prestador não encontrada."}

    base_url, headers = await _authed_client(config)

    cnpj_limpo = (config.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    payload = {
        "cpf_cnpj": cnpj_limpo,
        "nome_razao_social": config.razao_social or "",
        "nome_fantasia": config.nome_fantasia or config.razao_social or "",
        "inscricao_municipal": config.inscricao_municipal or "",
        "optante_simples_nacional": config.optante_simples,
        "email": "contato@atrio.com.br",
        "endereco": {
            "logradouro": config.logradouro or "",
            "numero": config.numero_endereco or "S/N",
            "complemento": config.complemento or "",
            "bairro": config.bairro or "",
            "codigo_municipio": config.codigo_municipio or "",
            "cidade": config.cidade or "",
            "uf": config.uf or "",
            "cep": (config.cep or "").replace("-", ""),
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{base_url}/empresas", headers=headers, json=payload)

        if resp.status_code in (400, 409) and "AlreadyExists" in resp.text:
            # Empresa já existe — tenta PUT
            resp = await client.put(f"{base_url}/empresas/{cnpj_limpo}", headers=headers, json=payload)

        if resp.status_code in (200, 201):
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


async def configurar_nfse_empresa(db: Session) -> dict:
    """Configura NFS-e para a empresa na Nuvem Fiscal."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Configuração do prestador não encontrada."}

    base_url, headers = await _authed_client(config)
    cnpj = (config.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    nuvem = _get_nuvem_config(config)
    ambiente = "producao" if nuvem["ambiente"] == "producao" else "homologacao"

    # opSimpNac: 1=Não optante, 2=Optante excesso sublimite, 3=ME/EPP Simples
    op_simp_nac = 3 if config.optante_simples else 1

    payload = {
        "ambiente": ambiente,
        "regTrib": {
            "opSimpNac": op_simp_nac,
            "regEspTrib": 0,
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(f"{base_url}/empresas/{cnpj}/nfse", headers=headers, json=payload)
        if resp.status_code in (200, 201):
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


async def upload_certificado_nuvem(db: Session, pfx_base64: str, senha: str) -> dict:
    """Upload do certificado digital A1 para Nuvem Fiscal."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Configuração do prestador não encontrada."}

    base_url, headers = await _authed_client(config)
    cnpj = (config.cnpj or "").replace(".", "").replace("/", "").replace("-", "")

    payload = {"certificado": pfx_base64, "password": senha}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(
            f"{base_url}/empresas/{cnpj}/certificado",
            headers=headers, json=payload
        )
        if resp.status_code in (200, 201):
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


# ============================================
# CADASTRO DE EMPRESA — POR CNPJ (multi-empresa)
# ============================================

async def cadastrar_empresa_por_cnpj(db: Session, empresa) -> dict:
    """Cadastra/atualiza empresa na Nuvem Fiscal a partir do modelo Empresa."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Credenciais Nuvem Fiscal não configuradas."}

    base_url, headers = await _authed_client(config)
    cnpj = (empresa.cnpj or "").replace(".", "").replace("/", "").replace("-", "")

    payload = {
        "cpf_cnpj": cnpj,
        "nome_razao_social": empresa.razao_social or "",
        "nome_fantasia": empresa.nome_fantasia or empresa.razao_social or "",
        "inscricao_municipal": empresa.inscricao_municipal or "",
        "optante_simples_nacional": empresa.optante_simples,
        "email": empresa.email or "",
        "endereco": {
            "logradouro": empresa.logradouro or "",
            "numero": empresa.numero_endereco or "S/N",
            "complemento": empresa.complemento or "",
            "bairro": empresa.bairro or "",
            "codigo_municipio": empresa.codigo_municipio or "",
            "cidade": empresa.cidade or "",
            "uf": empresa.uf or "",
            "cep": (empresa.cep or "").replace("-", ""),
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{base_url}/empresas", headers=headers, json=payload)
        if resp.status_code in (400, 409) and "AlreadyExists" in resp.text:
            resp = await client.put(f"{base_url}/empresas/{cnpj}", headers=headers, json=payload)
        if resp.status_code in (200, 201):
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


async def configurar_nfse_por_cnpj(db: Session, empresa) -> dict:
    """Configura NFS-e para empresa na Nuvem Fiscal."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Credenciais Nuvem Fiscal não configuradas."}

    base_url, headers = await _authed_client(config)
    cnpj = (empresa.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    nuvem = _get_nuvem_config(config)
    ambiente = "producao" if nuvem["ambiente"] == "producao" else "homologacao"
    op_simp_nac = 3 if empresa.optante_simples else 1

    payload = {
        "ambiente": ambiente,
        "rps": {
            "lote": 1,
            "serie": empresa.serie_rps or "1",
            "numero": empresa.ultimo_rps or 0,
        },
        "regTrib": {"opSimpNac": op_simp_nac, "regEspTrib": empresa.regime_especial or 0},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(f"{base_url}/empresas/{cnpj}/nfse", headers=headers, json=payload)
        if resp.status_code in (200, 201):
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


async def upload_certificado_por_cnpj(db: Session, empresa, pfx_base64: str, senha: str) -> dict:
    """Upload do certificado A1 para empresa na Nuvem Fiscal."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Credenciais Nuvem Fiscal não configuradas."}

    base_url, headers = await _authed_client(config)
    cnpj = (empresa.cnpj or "").replace(".", "").replace("/", "").replace("-", "")

    payload = {"certificado": pfx_base64, "password": senha}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(f"{base_url}/empresas/{cnpj}/certificado", headers=headers, json=payload)
        if resp.status_code in (200, 201):
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


# ============================================
# EMISSÃO NFS-e
# ============================================

def _build_dps_payload(nfse: Nfse, config: PrestadorConfig, prestador_data: dict | None = None) -> dict:
    """Monta o payload DPS no formato NFS-e Nacional para a Nuvem Fiscal API.

    Formato: { ambiente, referencia, infDPS: { tpAmb, dhEmi, prest, toma, serv, valores } }
    Ref: https://dev.nuvemfiscal.com.br/docs/api#tag/Nfse/operation/EmitirNfse

    Args:
        prestador_data: Dados dinâmicos do prestador (Gesthub). Se fornecido,
            sobrescreve campos do config para CNPJ, razão social, etc.

    Regras de regime tributário:
    - opSimpNac=3 (ME/EPP Simples Nacional): sem pAliq/vISSQN/vReceb/tribFed,
      usar pTotTribSN no totTrib
    - Regime Normal: inclui pAliq, vISSQN, vBC, tribFed com piscofins
    """
    # Se prestador_data (Gesthub), usa ele; senão, cai no config fixo
    if prestador_data:
        cnpj_prestador = prestador_data.get("cnpj", "")
    else:
        cnpj_prestador = (config.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    doc_tomador = (nfse.tomador_cpf_cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    is_cnpj = len(doc_tomador) == 14

    nuvem = _get_nuvem_config(config)
    ambiente = "producao" if nuvem and nuvem["ambiente"] == "producao" else "homologacao"
    tp_amb = 1 if ambiente == "producao" else 2

    is_simples = prestador_data.get("optante_simples", False) if prestador_data else bool(config.optante_simples)

    agora = datetime.now(BRT) - timedelta(minutes=10)  # margem para clock drift
    dh_emi = agora.strftime("%Y-%m-%dT%H:%M:%S")  # sem timezone offset
    competencia = nfse.competencia or nfse.data_emissao or date.today()
    d_compet = competencia.isoformat() if isinstance(competencia, date) else str(competencia)[:10]

    valor = round(nfse.valor_servicos or 0, 2)
    aliq_empresa = prestador_data.get("aliquota_iss", 0) if prestador_data else 0
    aliquota = round(nfse.aliquota_iss or aliq_empresa or config.aliquota_iss_padrao or 5.0, 4)
    valor_iss = round(valor * (aliquota / 100), 2)

    # Código tributação nacional (cTribNac) — 6 dígitos (iiSSdd)
    c_trib_nac = (
        nfse.codigo_tributacao_municipio
        or (prestador_data.get("codigo_tributacao", "") if prestador_data else "")
        or config.codigo_tributacao
        or "171901"  # contabilidade
    )

    # Código tributação municipal (cTribMun) — 3 dígitos (ex: "501" para Recife)
    c_trib_mun = (
        nfse.item_lista_servico
        or (prestador_data.get("item_lista_servico", "") if prestador_data else "")
        or config.item_lista_servico
        or ""
    )
    if len(c_trib_mun) > 3:
        c_trib_mun = c_trib_mun[:3]

    # CNAE — prestador_data do Gesthub tem prioridade
    cnae = nfse.codigo_cnae or (prestador_data.get("cnae", "") if prestador_data else "") or config.codigo_cnae or ""

    # --- Tomador ---
    toma = {
        "CNPJ" if is_cnpj else "CPF": doc_tomador,
        "xNome": nfse.tomador_razao_social or "",
    }

    # Dados do tomador vinculado (endereço, email, telefone)
    t = nfse.tomador
    if t:
        if getattr(t, "email", ""):
            toma["email"] = t.email
        if getattr(t, "telefone", ""):
            toma["fone"] = t.telefone

        # Endereço nacional
        logradouro = getattr(t, "logradouro", "") or ""
        cod_mun = getattr(t, "codigo_municipio", "") or ""
        if logradouro or cod_mun:
            end_nac = {}
            if cod_mun:
                end_nac["cMun"] = cod_mun
            if getattr(t, "cep", ""):
                end_nac["CEP"] = t.cep.replace("-", "")
            end = {"endNac": end_nac} if end_nac else {}
            if logradouro:
                end["xLgr"] = logradouro
            if getattr(t, "numero_endereco", ""):
                end["nro"] = t.numero_endereco
            if getattr(t, "complemento", ""):
                end["xCpl"] = t.complemento
            if getattr(t, "bairro", ""):
                end["xBairro"] = t.bairro
            if end:
                toma["end"] = end
    else:
        # Sem tomador vinculado — usa email da NFS-e se disponível
        if nfse.tomador_email:
            toma["email"] = nfse.tomador_email

    # --- Tributos (diferente para Simples Nacional vs Regime Normal) ---
    if is_simples:
        # ME/EPP (opSimpNac=3): sem pAliq, vISSQN, vBC, tribFed
        # Usar pTotTribSN (percentual Simples Nacional, default 2%)
        trib = {
            "tribMun": {"tribISSQN": 1},
            "totTrib": {"pTotTribSN": aliquota},
        }
        v_serv_prest = {"vServ": valor}
    else:
        # Regime Normal: inclui alíquota, ISS, tributos federais
        trib_mun = {
            "tribISSQN": 1,
            "vBC": valor,
            "pAliq": aliquota,
            "vISSQN": valor_iss,
            "vLiq": round(valor - valor_iss, 2),
        }
        if nfse.iss_retido:
            trib_mun["tpRetISSQN"] = 1

        trib_fed = {
            "vRetCP": round(nfse.valor_inss or 0, 2),
            "vRetIRRF": round(nfse.valor_ir or 0, 2),
            "vRetCSLL": round(nfse.valor_csll or 0, 2),
            "piscofins": {
                "CST": "06",
                "vBCPisCofins": 0,
                "pAliqPis": 0,
                "pAliqCofins": 0,
                "vPis": round(nfse.valor_pis or 0, 2),
                "vCofins": round(nfse.valor_cofins or 0, 2),
            },
        }

        trib = {"tribMun": trib_mun, "tribFed": trib_fed}
        v_serv_prest = {"vServ": valor, "vReceb": valor}

    # Referência SEMPRE única — usa ID + timestamp para evitar duplicata na Nuvem Fiscal
    referencia = f"nfse-{nfse.id}-{int(agora.timestamp())}"

    payload = {
        "ambiente": ambiente,
        "referencia": referencia,
        "infDPS": {
            "tpAmb": tp_amb,
            "dhEmi": dh_emi,
            "verAplic": "NfseSystem-1.0",
            "dCompet": d_compet,
            "prest": {
                "CNPJ": cnpj_prestador,
            },
            "toma": toma,
            "serv": {
                "cServ": {
                    k: v for k, v in {
                        "cTribNac": c_trib_nac,
                        "cTribMun": c_trib_mun or "",
                        "CNAE": cnae or "",
                        "xDescServ": nfse.descricao_servico or "Serviços contábeis",
                    }.items() if v
                },
            },
            "valores": {
                "vServPrest": v_serv_prest,
                "trib": trib,
            },
        },
    }

    return payload


def _ensure_tomador(db: Session, nfse: Nfse) -> None:
    """Cria ou vincula tomador automaticamente após emissão."""
    doc = (nfse.tomador_cpf_cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    if not doc:
        return
    existing = db.query(Tomador).filter(Tomador.cpf_cnpj == doc).first()
    if existing:
        if not nfse.tomador_id:
            nfse.tomador_id = existing.id
        return
    tomador = Tomador(
        cpf_cnpj=doc,
        razao_social=nfse.tomador_razao_social or "",
        email=nfse.tomador_email or "",
    )
    db.add(tomador)
    db.flush()
    nfse.tomador_id = tomador.id


async def emitir_nfse(db: Session, nfse_ids: list[int], prestador_data: dict | None = None) -> dict:
    """Emite NFS-e(s) via Nuvem Fiscal API.

    Args:
        prestador_data: Dados do prestador do Gesthub (dinâmico).
            Se None, usa PrestadorConfig fixo.
    """
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Configuração do prestador não encontrada."}

    try:
        base_url, headers = await _authed_client(config)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    nfses = db.query(Nfse).filter(Nfse.id.in_(nfse_ids)).all()
    if not nfses:
        return {"ok": False, "error": "Nenhuma NFS-e encontrada."}

    resultados = []

    async with httpx.AsyncClient(timeout=60) as client:
        for nfse in nfses:
            if nfse.status not in ("PENDENTE", "ERRO", "RASCUNHO"):
                resultados.append({
                    "id": nfse.id, "numero": nfse.numero,
                    "ok": False, "error": f"Status '{nfse.status}' não permite emissão."
                })
                continue

            try:
                # Vincular tomador ANTES de montar o payload (para incluir endereço)
                _ensure_tomador(db, nfse)
                db.flush()
                # Forçar carregamento da relação tomador após vinculação
                if nfse.tomador_id and not nfse.tomador:
                    db.refresh(nfse, ["tomador"])

                payload = _build_dps_payload(nfse, config, prestador_data=prestador_data)

                nfse.status = "PROCESSANDO"
                db.commit()

                resp = await client.post(
                    f"{base_url}/nfse/dps",
                    headers=headers,
                    json=payload,
                )

                resp_text = resp.text[:5000]
                _log_xml(db, nfse.id, "NUVEM_FISCAL_EMITIR",
                         str(payload)[:5000], resp_text,
                         resp.status_code, "", resp.status_code in (200, 201, 202),
                         f"Emissão NFS-e {nfse.numero} via Nuvem Fiscal")

                if resp.status_code in (200, 201, 202):
                    data = resp.json()
                    nfse.status = "EMITIDA"
                    nfse.origem = "EMITIDA"
                    # Nuvem Fiscal retorna id do documento
                    nfse.protocolo = data.get("id", "")
                    nfse.chave_acesso = data.get("chave_acesso", data.get("id", ""))
                    # Número real da NFS-e (pode vir em vários campos)
                    num_real = (
                        data.get("numero_nfse")
                        or data.get("numero")
                        or (data.get("nfse", {}) or {}).get("numero")
                        or nfse.numero
                    )
                    nfse.numero = str(num_real)
                    nfse.codigo_verificacao = (
                        data.get("codigo_verificacao")
                        or (data.get("nfse", {}) or {}).get("codigo_verificacao")
                        or ""
                    )
                    nfse.data_emissao = date.today()
                    if data.get("valor_iss"):
                        nfse.valor_iss = float(data["valor_iss"])
                    # Gravar CNPJ do prestador na NFS-e
                    cnpj_prest = (
                        prestador_data.get("cnpj", "") if prestador_data
                        else (config.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
                    )
                    if cnpj_prest and not nfse.prestador_cnpj:
                        nfse.prestador_cnpj = cnpj_prest
                    if not nfse.prestador_razao_social:
                        nfse.prestador_razao_social = (
                            prestador_data.get("razao_social", "") if prestador_data
                            else config.razao_social or ""
                        )
                    # Consultar status para pegar número real da prefeitura
                    # A prefeitura pode levar alguns segundos para processar
                    nuvem_id = data.get("id", "")
                    if nuvem_id:
                        numero_encontrado = False
                        for tentativa in range(3):  # 3 tentativas: 3s, 5s, 7s
                            await asyncio.sleep(3 + tentativa * 2)
                            try:
                                status_resp = await client.get(
                                    f"{base_url}/nfse/{nuvem_id}",
                                    headers=headers,
                                )
                                if status_resp.status_code == 200:
                                    status_data = status_resp.json()
                                    if status_data.get("numero"):
                                        nfse.numero = str(status_data["numero"])
                                        numero_encontrado = True
                                    if status_data.get("chave_acesso"):
                                        nfse.chave_acesso = status_data["chave_acesso"]
                                    if status_data.get("codigo_verificacao"):
                                        nfse.codigo_verificacao = status_data["codigo_verificacao"]
                                    if numero_encontrado:
                                        break
                            except Exception:
                                pass
                        # Se após 3 tentativas ainda não tem número, marca PROCESSANDO
                        # para que o poll-processando resolva depois
                        if not numero_encontrado and (not nfse.numero or nfse.numero.startswith("PEND-") or nfse.numero == "AUTO"):
                            nfse.status = "PROCESSANDO"

                    db.commit()

                    resultados.append({
                        "id": nfse.id, "numero": nfse.numero,
                        "ok": True,
                        "nuvemFiscalId": data.get("id"),
                        "chaveAcesso": nfse.chave_acesso,
                        "status": data.get("status"),
                    })
                else:
                    nfse.status = "ERRO"
                    nfse.mensagem_retorno = resp_text[:500]
                    db.commit()
                    resultados.append({
                        "id": nfse.id, "numero": nfse.numero,
                        "ok": False, "error": f"HTTP {resp.status_code}: {resp_text[:300]}"
                    })

            except Exception as e:
                nfse.status = "ERRO"
                nfse.mensagem_retorno = str(e)[:500]
                db.commit()
                resultados.append({
                    "id": nfse.id, "numero": nfse.numero,
                    "ok": False, "error": str(e)
                })

    return {"ok": True, "data": resultados}


# ============================================
# CONSULTA
# ============================================

async def consultar_nfse(db: Session, nuvem_fiscal_id: str) -> dict:
    """Consulta NFS-e pelo ID da Nuvem Fiscal."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Config não encontrada."}

    try:
        base_url, headers = await _authed_client(config)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{base_url}/nfse/{nuvem_fiscal_id}", headers=headers)

        _log_xml(db, None, "NUVEM_FISCAL_CONSULTAR", "", resp.text[:5000],
                 resp.status_code, "", resp.status_code == 200,
                 f"Consulta Nuvem Fiscal {nuvem_fiscal_id}")

        if resp.status_code == 200:
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


async def consultar_status(db: Session, nuvem_fiscal_id: str) -> dict:
    """Consulta status de processamento de uma NFS-e."""
    result = await consultar_nfse(db, nuvem_fiscal_id)
    if not result.get("ok"):
        return result
    data = result["data"]
    return {
        "ok": True,
        "data": {
            "id": data.get("id"),
            "status": data.get("status"),
            "numero": data.get("numero"),
            "chave_acesso": data.get("chave_acesso"),
            "mensagens": data.get("mensagens", []),
        }
    }


# ============================================
# PDF — Download DANFS-e
# ============================================

async def baixar_pdf(db: Session, nuvem_fiscal_id: str) -> dict:
    """Baixa o PDF (DANFS-e) da NFS-e emitida."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Config não encontrada."}

    try:
        base_url, headers = await _authed_client(config)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    # PDF endpoint retorna bytes
    headers_pdf = {**headers, "Accept": "application/pdf"}
    del headers_pdf["Content-Type"]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{base_url}/nfse/{nuvem_fiscal_id}/pdf", headers=headers_pdf)

        if resp.status_code == 200:
            return {"ok": True, "content": resp.content, "content_type": "application/pdf"}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


# ============================================
# CANCELAMENTO
# ============================================

async def cancelar_nfse(db: Session, nuvem_fiscal_id: str, motivo: str = "Cancelamento solicitado") -> dict:
    """Cancela NFS-e via Nuvem Fiscal."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Config não encontrada."}

    try:
        base_url, headers = await _authed_client(config)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    # API Nuvem Fiscal aceita body vazio para cancelamento
    payload = {}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base_url}/nfse/{nuvem_fiscal_id}/cancelamento",
            headers=headers, json=payload
        )

        _log_xml(db, None, "NUVEM_FISCAL_CANCELAR", str(payload), resp.text[:5000],
                 resp.status_code, "", False,
                 f"Cancelamento Nuvem Fiscal {nuvem_fiscal_id}")

        if resp.status_code not in (200, 201, 202):
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}

        data = resp.json()
        status = data.get("status", "")
        mensagens = data.get("mensagens", [])

        # Verifica se o cancelamento realmente foi aceito
        if status == "erro" and mensagens:
            msg = mensagens[0].get("descricao", "Erro desconhecido")
            return {"ok": False, "error": f"Cancelamento rejeitado: {msg}"}

        return {"ok": True, "data": data}


# ============================================
# LISTAR NFS-e emitidas
# ============================================

async def listar_nfse_api(db: Session, cnpj: str = None, pagina: int = 1) -> dict:
    """Lista NFS-e emitidas na Nuvem Fiscal para o CNPJ."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Config não encontrada."}

    try:
        base_url, headers = await _authed_client(config)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    cnpj_limpo = (cnpj or config.cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    params = {"cpf_cnpj": cnpj_limpo, "$skip": (pagina - 1) * 50, "$top": 50}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{base_url}/nfse", headers=headers, params=params)

        if resp.status_code == 200:
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}


# ============================================
# UTILS
# ============================================

def _log_xml(db: Session, nfse_id, tipo, xml_envio, xml_retorno,
             http_status, protocolo, sucesso, mensagem):
    log = XmlLog(
        nfse_id=nfse_id,
        tipo_operacao=tipo,
        xml_envio=xml_envio or "",
        xml_retorno=xml_retorno or "",
        http_status=http_status,
        protocolo=protocolo or "",
        sucesso=sucesso,
        mensagem=mensagem or "",
    )
    db.add(log)
    db.commit()
