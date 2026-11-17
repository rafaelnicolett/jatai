import os

DIAS_DE_EMPRESTIMO = int(os.environ.get("DIAS_DE_EMPRESTIMO", "14"))
FUSO_DA_BIBLIOTECA = os.environ.get("FUSO_DA_BIBLIOTECA", "America/Sao_Paulo")
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///biblioteca.db")
