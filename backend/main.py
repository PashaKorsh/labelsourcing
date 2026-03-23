from fastapi import FastAPI
import psycopg2

app = FastAPI()

# ---------------- DB ----------------
def get_conn():
    return psycopg2.connect(
        dbname="testdb",
        user="test",
        password="test",
        host="db"
    )

# ---------------- ROUTES ----------------
@app.get("/api/hello")
def hello():
    return {"message": "Hello!"}

@app.get("/api/users")
def get_users():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT name FROM users ORDER BY id")
    rows = cur.fetchall()

    cur.close()
    conn.close()

    users = [
        {"username": username}
        for username in rows
    ]

    return {"users": users}