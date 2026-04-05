"""Router para clientes — consome API do Gesthub."""

from fastapi import APIRouter, Query, Request

from backend.services.gesthub import (
    get_clientes, get_cliente_by_cnpj, search_clientes,
    update_cliente, enriquecer_cnpj_gesthub,
)

router = APIRouter(prefix="/clientes", tags=["clientes"])


@router.get("")
async def listar_clientes(search: str = Query(None)):
    """Lista clientes ativos do Gesthub."""
    try:
        if search:
            data = await search_clientes(search)
        else:
            data = await get_clientes()
        return {"ok": True, "data": data}
    except Exception as e:
        return {"ok": False, "error": str(e), "data": []}


@router.get("/{cnpj}")
async def buscar_cliente(cnpj: str):
    """Busca cliente por CNPJ."""
    try:
        cliente = await get_cliente_by_cnpj(cnpj)
        if not cliente:
            return {"ok": False, "error": "Cliente não encontrado."}
        return {"ok": True, "data": cliente}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.put("/sync-gesthub/{client_id}")
async def sync_cliente_gesthub(client_id: int, request: Request):
    """Sincroniza dados de volta ao Gesthub (atualização parcial).

    Recebe JSON com campos em camelCase que devem ser atualizados no Gesthub.
    Usado quando NFS-e System descobre dados novos (ex: via Receita Federal).
    """
    try:
        payload = await request.json()
        data = await update_cliente(client_id, payload)
        return {"ok": True, "data": data}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/enriquecer-gesthub/{client_id}")
async def enriquecer_cliente_gesthub(client_id: int):
    """Dispara enriquecimento de CNPJ no Gesthub via Receita Federal.

    O Gesthub busca na BrasilAPI e atualiza todos os campos automaticamente.
    """
    try:
        result = await enriquecer_cnpj_gesthub(client_id)
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}
