import { useState } from "react"

type User = {
  id: number
  username: string
}

function App() {
  const [hello, setHello] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [message, setMessage] = useState("")

  const loadHello = async () => {
    try {
      const res = await fetch("/api/hello")
      const data = await res.json()
      setHello(data.message ?? JSON.stringify(data))
      setMessage("Loaded /api/hello")
    } catch (err) {
      setMessage("Error loading /api/hello")
    }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users")
      const data = await res.json()
      setUsers(data.users ?? [])
      setMessage("Loaded users")
    } catch (err) {
      setMessage("Error loading users")
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Demo</h1>

      <h2>/api/hello</h2>
      <button onClick={loadHello}>Load hello</button>
      {hello && <pre>{hello}</pre>}

      <hr />

      <h2>/api/users</h2>
      <button onClick={loadUsers}>Load users</button>

      {users.length > 0 && (
        <pre>{JSON.stringify(users, null, 2)}</pre>
      )}

      <h3>Status:</h3>
      <pre>{message}</pre>
    </div>
  )
}

export default App