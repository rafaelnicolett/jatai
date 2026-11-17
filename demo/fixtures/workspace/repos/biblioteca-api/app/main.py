from fastapi import FastAPI

from app.routers import emprestimos, livros, reservas

app = FastAPI(title="Biblioteca de Bairro")
app.include_router(livros.router)
app.include_router(emprestimos.router)
app.include_router(reservas.router)
