"""Consulta CNPJ na Receita Federal via BrasilAPI (gratuita, sem autenticação)."""

import httpx

BRASIL_API_URL = "https://brasilapi.com.br/api/cnpj/v1"


async def consultar_cnpj(cnpj: str) -> dict:
    """Consulta dados completos de um CNPJ na Receita Federal.

    Returns dict com campos normalizados para uso no sistema.
    """
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "").replace(" ", "")

    if len(cnpj_limpo) != 14 or not cnpj_limpo.isdigit():
        raise ValueError("CNPJ inválido. Deve conter 14 dígitos.")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BRASIL_API_URL}/{cnpj_limpo}")

        if resp.status_code == 404:
            raise ValueError("CNPJ não encontrado na Receita Federal.")
        if resp.status_code == 429:
            raise ValueError("Limite de consultas excedido. Tente novamente em alguns segundos.")

        resp.raise_for_status()
        data = resp.json()

    # Monta QSA (quadro de sócios)
    socios = []
    for s in (data.get("qsa") or []):
        socios.append({
            "nome": s.get("nome_socio", ""),
            "cpfCnpj": s.get("cnpj_cpf_do_socio", ""),
            "qualificacao": s.get("qualificacao_socio", ""),
            "dataEntrada": s.get("data_entrada_sociedade", ""),
            "faixaEtaria": s.get("faixa_etaria", ""),
        })

    # Atividades secundárias
    cnaes_secundarios = []
    for a in (data.get("cnaes_secundarios") or []):
        if a.get("codigo") and a["codigo"] != 0:
            cnaes_secundarios.append({
                "codigo": str(a["codigo"]),
                "descricao": a.get("descricao", ""),
            })

    return {
        "cnpj": cnpj_limpo,
        "razaoSocial": data.get("razao_social", ""),
        "nomeFantasia": data.get("nome_fantasia", ""),
        "situacao": data.get("descricao_situacao_cadastral", ""),
        "dataAbertura": data.get("data_inicio_atividade", ""),
        "naturezaJuridica": data.get("natureza_juridica", ""),
        "porte": data.get("porte", ""),
        # Endereço
        "logradouro": data.get("logradouro", ""),
        "numero": data.get("numero", ""),
        "complemento": data.get("complemento", ""),
        "bairro": data.get("bairro", ""),
        "cidade": data.get("municipio", ""),
        "uf": data.get("uf", ""),
        "cep": data.get("cep", ""),
        "codigoMunicipio": str(data.get("codigo_municipio", "") or ""),
        "codigoMunicipioIbge": str(data.get("codigo_municipio_ibge", "") or ""),
        # Contato
        "telefone": data.get("ddd_telefone_1", ""),
        "telefone2": data.get("ddd_telefone_2", ""),
        "email": (data.get("email") or "").lower(),
        # CNAE
        "cnaePrincipal": str(data.get("cnae_fiscal", "") or ""),
        "cnaePrincipalDescricao": data.get("cnae_fiscal_descricao", ""),
        "cnaesSecundarios": cnaes_secundarios,
        # Sócios
        "socios": socios,
        # Extras
        "capitalSocial": data.get("capital_social", 0),
        "optanteMei": data.get("opcao_pelo_mei", False),
        "optanteSimples": data.get("opcao_pelo_simples", False),
    }
