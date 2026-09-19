import { useState, useEffect } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import './App.css'

const COLORS = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#a78bfa']

function App() {
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({})
  const [recurring, setRecurring] = useState([])

  // Form State
  const [amount, setAmount] = useState('')
  const [rawDescription, setRawDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  const fetchData = async () => {
    try {
      const [txRes, sumRes, recRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/transactions/'),
        fetch('http://127.0.0.1:8000/summary/'),
        fetch('http://127.0.0.1:8000/recurring/')
      ])

      const txData = await txRes.json()
      const sumData = await sumRes.json()
      const recData = await recRes.json()

      setTransactions(txData)
      setSummary(sumData.spending_by_category || {})
      setRecurring(recData.recurring_subscriptions || [])
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || !rawDescription) return

    await fetch('http://127.0.0.1:8000/transactions/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(amount),
        raw_description: rawDescription,
        date: date
      })
    })

    setAmount('')
    setRawDescription('')
    fetchData() 
  }

  
  const chartData = Object.entries(summary).map(([category, total]) => ({
    name: category,
    value: total
  }))

  const totalSpent = transactions.reduce((acc, curr) => acc + (curr.amount || 0), 0)

  return (
    <div className="dashboard-container">
      <header>
        <h1>AI Financial Coach</h1>
      </header>

      
      <section className="metrics-grid">
        <div className="card">
          <h3>Total Expenditure</h3>
          <p className="metric-val">${totalSpent.toFixed(2)}</p>
        </div>
        <div className="card">
          <h3>Total Logged</h3>
          <p className="metric-val">{transactions.length} Txns</p>
        </div>
        <div className="card">
          <h3>Active Subscriptions</h3>
          <p className="metric-val">{recurring.length} Flagged</p>
        </div>
      </section>

      <section className="main-grid">
        
        <div className="card">
          <h3>Add Transaction</h3>
          <form className="form-group" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Description (e.g., Spotify, Uber)"
              value={rawDescription}
              onChange={(e) => setRawDescription(e.target.value)}
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Amount (e.g., 9.99)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <button type="submit">Log Transaction</button>
          </form>
        </div>

        
        <div className="card">
          <h3>Spending by Category</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ marginTop: '2rem', color: '#64748b' }}>No expenses recorded yet.</p>
          )}
        </div>
      </section>

      
      {recurring.length > 0 && (
        <section className="card" style={{ marginBottom: '2rem' }}>
          <h3>Flagged Recurring Expenses</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Occurrences</th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.raw_description}</td>
                    <td>${item.amount.toFixed(2)}</td>
                    <td>{item.frequency}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      
      <section className="card">
        <h3>Recent Transactions</h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(-6).reverse().map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>{tx.raw_description}</td>
                  <td>{tx.category}</td>
                  <td>${tx.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App