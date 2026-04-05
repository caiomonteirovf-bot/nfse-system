"""Router para consulta de CNPJ na Receita Federal e enriquecimento do Gesthub."""

from fastapi import APIRouter, Query

from backend.services.receita import consultar_cnpj
from backend.services.gesthub import get_cliente_by_cnpj, update_cliente, importar_socios

router = APIRouter(prefix="/cnpj", tags=["cnpj"])


@router.get("/{cnpj}")
async def buscar_cnpj(cnpj: str, salvar_gesthub: bool = Query(True)):
    """Consulta CNPJ na Receita Federal via BrasilAPI.

    Se salvar_gesthub=true (default), atualiza automaticamente o cadastro
    do cliente no Gesthub com os dados da Receita e importa sócios.
    """
    try:
        dados = await consultar_cnpj(cnpj)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": f"Erro ao consultar CNPJ: {str(e)}"}

    gesthub_update = None

    if salvar_gesthub:
        try:
            cliente = await get_cliente_by_cnpj(dados["cnpj"])
            if cliente and cliente.get("id"):
                client_id = cliente["id"]
                # Atualiza dados do cliente com info da Receita
                update_data = {
                    "legalName": dados.get("razaoSocial") or cliente.get("legalName", ""),
                    "tradeName": dados.get("nomeFantasia") or cliente.get("tradeName", ""),
                    "city": dados.get("cidade") or cliente.get("city", "--"),
                    "state": dados.get("uf") or cliente.get("state", "--"),
                    "phone": dados.get("telefone") or cliente.get("phone", ""),
                    "email": dados.get("email") or cliente.get("email", ""),
                    "logradouro": dados.get("logradouro", ""),
                    "numeroEndereco": dados.get("numero", ""),
                    "complemento": dados.get("complemento", ""),
                    "bairro": dados.get("bairro", ""),
                    "cep": dados.get("cep", ""),
                    "codigoMunicipioIbge": dados.get("codigoMunicipioIbge", ""),
                    "cnaePrincipal": dados.get("cnaePrincipal", ""),
                    "cnaeDescricao": dados.get("cnaePrincipalDescricao", ""),
                    "naturezaJuridica": dados.get("naturezaJuridica", ""),
                    "porte": dados.get("porte", ""),
                    "capitalSocial": dados.get("capitalSocial", 0),
                    "dataAbertura": dados.get("dataAbertura", ""),
                    "situacaoCadastral": dados.get("situacao", ""),
                    "optanteSimples": dados.get("optanteSimples", False),
                    "optanteMei": dados.get("optanteMei", False),
                }
                await update_cliente(client_id, update_data)

                # Importa sócios se houver
                socios_importados = 0
                if dados.get("socios"):
                    result = await importar_socios(client_id, dados["socios"])
                    socios_importados = result.get("criados", 0)

                gesthub_update = {
                    "clienteId": client_id,
                    "atualizado": True,
                    "sociosImportados": socios_importados,
                }
            else:
                gesthub_update = {"atualizado": False, "motivo": "Cliente nao encontrado no Gesthub"}
        except Exception as e:
            gesthub_update = {"atualizado": False, "motivo": str(e)}

    return {
        "ok": True,
        "data": dados,
        "gesthub": gesthub_update,
    }
