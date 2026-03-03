import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/nfse.db")

# Se for postgres, ajustar driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# NFS-e / ABRASF (fallback defaults, overridden by DB prestador_config)
NFSE_WEBSERVICE_URL = os.getenv("NFSE_WEBSERVICE_URL", "")
NFSE_PRESTADOR_CNPJ = os.getenv("NFSE_PRESTADOR_CNPJ", "")
NFSE_INSCRICAO_MUNICIPAL = os.getenv("NFSE_INSCRICAO_MUNICIPAL", "")
NFSE_RAZAO_SOCIAL = os.getenv("NFSE_RAZAO_SOCIAL", "")
NFSE_MUNICIPIO_CODIGO = os.getenv("NFSE_MUNICIPIO_CODIGO", "")
NFSE_AMBIENTE = os.getenv("NFSE_AMBIENTE", "HOMOLOGACAO")
