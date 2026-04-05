"""Integração com Gesthub API — busca clientes/prestadores para emissão de NFS-e."""

import time
import httpx

import os

GESTHUB_URL = os.getenv("GESTHUB_URL", "https://gesthub-xlvb.onrender.com")
GESTHUB_API_KEY = os.getenv("GESTHUB_API_KEY", "")
CACHE_TTL = 5 * 60  # 5 minutos

_cache = {"data": None, "timestamp": 0}


async def _get_bootstrap() -> dict:
    """Busca bootstrap do Gesthub com cache."""
    now = time.time()
    if _cache["data"] and (now - _cache["timestamp"]) < CACHE_TTL:
        return _cache["data"]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{GESTHUB_URL}/api/bootstrap")
        resp.raise_for_status()
        payload = resp.json()
        if not payload.get("ok"):
            raise ValueError(payload.get("error", "Erro ao buscar Gesthub"))
        _cache["data"] = payload["data"]
        _cache["timestamp"] = now
        return payload["data"]


def invalidate_cache():
    _cache["data"] = None
    _cache["timestamp"] = 0


async def get_clientes() -> list[dict]:
    """Retorna lista de clientes ativos do Gesthub."""
    data = await _get_bootstrap()
    clients = data.get("clients", [])
    # Retorna apenas ativos com CNPJ
    return [
        {
            "id": c["id"],
            "document": c.get("document", ""),
            "legalName": c.get("legalName", ""),
            "tradeName": c.get("tradeName", ""),
            "status": c.get("status", ""),
            "taxRegime": c.get("taxRegime", ""),
            "city": c.get("city", ""),
            "state": c.get("state", ""),
            "analyst": c.get("analyst", ""),
            "monthlyFee": c.get("monthlyFee", 0),
            "phone": c.get("phone", ""),
            "email": c.get("email", ""),
            "ativo": c.get("ativo", False),
        }
        for c in clients
        if c.get("document") or c.get("legalName")
    ]


async def get_cliente_by_cnpj(cnpj: str) -> dict | None:
    """Busca cliente por CNPJ."""
    clientes = await get_clientes()
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    for c in clientes:
        doc = (c.get("document") or "").replace(".", "").replace("/", "").replace("-", "")
        if doc == cnpj_limpo:
            return c
    return None


async def search_clientes(term: str) -> list[dict]:
    """Busca clientes por nome ou CNPJ."""
    clientes = await get_clientes()
    term_lower = term.lower().strip()
    return [
        c for c in clientes
        if term_lower in (c.get("legalName") or "").lower()
        or term_lower in (c.get("tradeName") or "").lower()
        or term_lower in (c.get("document") or "").replace(".", "").replace("/", "").replace("-", "")
    ][:20]


def _ext_headers() -> dict:
    """Headers para API externa do Gesthub (com API key)."""
    headers = {}
    if GESTHUB_API_KEY:
        headers["X-API-Key"] = GESTHUB_API_KEY
    return headers


async def update_cliente(client_id: int, data: dict) -> dict:
    """Atualiza dados de um cliente no Gesthub.

    Usa API externa (/api/external/) se API key configurada, senão cai na interna.
    Aceita payload parcial (só campos que mudaram).
    """
    invalidate_cache()
    if GESTHUB_API_KEY:
        url = f"{GESTHUB_URL}/api/external/clients/{client_id}"
        headers = _ext_headers()
    else:
        url = f"{GESTHUB_URL}/api/clients/{client_id}"
        headers = {}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(url, json=data, headers=headers)
        resp.raise_for_status()
        payload = resp.json()
        if not payload.get("ok"):
            raise ValueError(payload.get("error", "Erro ao atualizar cliente"))
        return payload.get("data", {})


async def enriquecer_cnpj_gesthub(client_id: int) -> dict:
    """Dispara enriquecimento via Receita Federal no Gesthub.

    O Gesthub busca na BrasilAPI, atualiza campos e importa sócios.
    """
    if GESTHUB_API_KEY:
        url = f"{GESTHUB_URL}/api/external/clients/{client_id}/enriquecer-cnpj"
        headers = _ext_headers()
    else:
        url = f"{GESTHUB_URL}/api/clients/{client_id}/enriquecer-cnpj"
        headers = {}

    invalidate_cache()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers)
        resp.raise_for_status()
        payload = resp.json()
        if not payload.get("ok"):
            raise ValueError(payload.get("error", "Erro ao enriquecer CNPJ"))
        return payload


async def importar_socios(client_id: int, socios: list[dict]) -> dict:
    """Importa sócios em lote para um cliente no Gesthub."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{GESTHUB_URL}/api/clients/{client_id}/socios/bulk",
            json={"socios": socios},
        )
        resp.raise_for_status()
        return resp.json()
