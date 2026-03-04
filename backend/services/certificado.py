"""Gestao de certificado digital A1 (.pfx) para mTLS com API NFS-e Nacional."""

import ssl
import tempfile
from datetime import datetime, timedelta

from cryptography.hazmat.primitives.serialization import pkcs12, Encoding, PrivateFormat, NoEncryption
from cryptography.x509 import oid as x509_oid
from sqlalchemy.orm import Session

from backend.models.prestador import PrestadorConfig


def upload_certificado(db: Session, pfx_bytes: bytes, senha: str) -> dict:
    """Valida o .pfx, extrai informacoes e armazena no banco."""
    senha_bytes = senha.encode("utf-8") if senha else b""

    try:
        private_key, certificate, _ = pkcs12.load_key_and_certificates(pfx_bytes, senha_bytes)
    except Exception as e:
        return {"ok": False, "error": f"Certificado invalido ou senha incorreta: {e}"}

    if certificate is None:
        return {"ok": False, "error": "Certificado nao encontrado no arquivo .pfx"}

    # Extrair CNPJ do subject
    cnpj = ""
    try:
        for attr in certificate.subject:
            # OID 2.16.76.1.3.3 = CNPJ no padrao ICP-Brasil
            if attr.oid.dotted_string == "2.16.76.1.3.3":
                cnpj = attr.value
                break
        if not cnpj:
            # Tentar extrair do CN
            cn = certificate.subject.get_attributes_for_oid(x509_oid.NameOID.COMMON_NAME)
            if cn:
                cn_val = cn[0].value
                # CNPJ geralmente aparece como :CNPJNUMBER no CN
                import re
                match = re.search(r'(\d{14})', cn_val)
                if match:
                    cnpj = match.group(1)
    except Exception:
        pass

    validade = certificate.not_valid_after_utc.replace(tzinfo=None)
    status = _calcular_status(validade)

    # Salvar no banco
    config = db.query(PrestadorConfig).first()
    if not config:
        config = PrestadorConfig()
        db.add(config)

    config.certificado_pfx = pfx_bytes
    config.certificado_senha = senha  # Em producao, criptografar com Fernet
    config.certificado_validade = validade
    config.certificado_cnpj = cnpj
    config.certificado_status = status
    db.commit()
    db.refresh(config)

    return {
        "ok": True,
        "data": {
            "cnpj": cnpj,
            "validade": validade.isoformat(),
            "status": status,
            "subject": certificate.subject.rfc4514_string(),
        },
    }


def get_ssl_context(db: Session) -> ssl.SSLContext | None:
    """Cria contexto SSL com o certificado A1 para mTLS."""
    config = db.query(PrestadorConfig).first()
    if not config or not config.certificado_pfx:
        return None

    senha_bytes = config.certificado_senha.encode("utf-8") if config.certificado_senha else b""

    try:
        private_key, certificate, additional = pkcs12.load_key_and_certificates(
            config.certificado_pfx, senha_bytes
        )
    except Exception:
        return None

    # Escrever cert e key em arquivos temporarios para o SSL context
    cert_pem = certificate.public_bytes(Encoding.PEM)
    key_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())

    cert_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    cert_file.write(cert_pem)
    cert_file.close()

    key_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    key_file.write(key_pem)
    key_file.close()

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.load_cert_chain(cert_file.name, key_file.name)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # API gov pode ter cert chain propria

    return ctx


def verificar_validade(db: Session) -> str:
    """Atualiza e retorna o status do certificado."""
    config = db.query(PrestadorConfig).first()
    if not config or not config.certificado_validade:
        return ""

    status = _calcular_status(config.certificado_validade)
    if config.certificado_status != status:
        config.certificado_status = status
        db.commit()

    return status


def _calcular_status(validade: datetime) -> str:
    """Calcula status baseado na data de validade."""
    agora = datetime.utcnow()
    if validade < agora:
        return "VENCIDO"
    if validade < agora + timedelta(days=30):
        return "A_VENCER"
    return "NO_PRAZO"
