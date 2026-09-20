import React, { useState } from 'react';
import { Bell, Send, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [aiAdvice, setAiAdvice] = useState('');
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'How can I help you today?' }
  ]);
  const [showPassword, setShowPassword] = useState(false);

  const [authData, setAuthData] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);

  const [onboardData, setOnboardData] = useState({ balance: '', income: '', payday: '' });
  
  const [dashboardData, setDashboardData] = useState({
    total_balance: 0,
    monthly_income: 0,
    total_spent: 0,
    transactions: []
  });

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Budgets & 5-Month History State
  const [monthsData, setMonthsData] = useState([]);
  const [currentMonthOffset, setCurrentMonthOffset] = useState(0);
  const [newBudget, setNewBudget] = useState({ category: '', limit: '' });
  const [overallLimitInput, setOverallLimitInput] = useState('');
  const [expandedCategory, setExpandedCategory] = useState(null);

  const fetchNotifications = async (userId) => {
    try {
      const res = await fetch(`http://localhost:8000/user/notifications/${userId}`);
      const data = await res.json();
      if (res.ok) setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBudgets = async (userId) => {
    if (!userId) return;
    try {
      const res = await fetch(`http://localhost:8000/user/budgets/${userId}`);
      const data = await res.json();
      if (res.ok) setMonthsData(data.months || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAiAdvice = async () => {
    if (!user?.id) return;
    setLoadingAdvice(true);
    try {
      const res = await fetch(`http://localhost:8000/user/ai-advice/${user.id}`);
      const data = await res.json();
      if (res.ok) setAiAdvice(data.advice);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const fetchDashboardData = async (userId) => {
    if (!userId) return;
    fetchNotifications(userId); 
    fetchBudgets(userId);
    try {
      const res = await fetch(`http://localhost:8000/user/dashboard/${userId}`);
      const data = await res.json();
      if (res.ok) {
        setDashboardData({
          total_balance: data.metrics.total_balance,
          monthly_income: data.metrics.monthly_income,
          total_spent: data.metrics.total_spent,
          transactions: data.transactions
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (user?.id) {
      if (tab === 'records') fetchDashboardData(user.id);
      if (tab === 'categories') fetchBudgets(user.id);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = currentView === 'signup' ? '/auth/signup' : '/auth/login';
    const body = currentView === 'signup'
      ? { first_name: authData.firstName, last_name: authData.lastName, email: authData.email, password: authData.password }
      : { email: authData.email, password: authData.password };

    try {
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.detail || 'Authentication failed.');
        return;
      }
      localStorage.setItem('wealthwise_token', data.token);
      setUser(data.user);
      setAuthData({ firstName: '', lastName: '', email: '', password: '' });
      setActiveTab('chat');
      setCurrentView('dashboard');
      fetchDashboardData(data.user.id); 
    } catch (err) {
      setAuthError('Cannot connect to backend server. Make sure FastAPI is running.');
    }
  };

  const handleOnboardSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/user/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          current_balance: parseFloat(onboardData.balance) || 0,
          monthly_income: parseFloat(onboardData.income) || 0,
          payday_date: parseInt(onboardData.payday) || 1
        })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setMessages([{ role: 'ai', text: `Perfect. I've set your starting balance to ₹${onboardData.balance}. Your dashboard is now fully unlocked. Would you like to log your first expense, or should we set a savings goal for this month?` }]);
        fetchDashboardData(user.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/user/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          category: newBudget.category,
          limit_amount: parseFloat(newBudget.limit)
        })
      });
      if (res.ok) {
        setNewBudget({ category: '', limit: '' });
        fetchBudgets(user.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOverallBudgetSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/user/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          category: '__OVERALL__',
          limit_amount: parseFloat(overallLimitInput)
        })
      });
      if (res.ok) {
        setOverallLimitInput('');
        fetchBudgets(user.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wealthwise_token');
    setUser(null);
    setCurrentView('landing');
  };

  const handleSend = async () => {
    if (!chatInput.trim() || !user?.is_onboarded) return;
    const userText = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput('');

    if (userText.toLowerCase().includes("no expenses today")) {
      setMessages(prev => [...prev, { role: 'ai', text: "Zero expenditure recorded for today. Excellent financial discipline—your capital remains fully preserved." }]);
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/chat/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_text: userText
        })
      });
      const data = await response.json();
      
      // Catch backend errors and display them in chat
      if (!response.ok) {
        setMessages(prev => [...prev, { role: 'ai', text: `Error: ${data.detail || 'Failed to process request.'}` }]);
        return;
      }

      setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
      fetchDashboardData(user.id);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Server error. Make sure FastAPI is running.' }]);
    }
  };

  const toggleCategoryExpand = (catId) => {
    setExpandedCategory(expandedCategory === catId ? null : catId);
  };

  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-zinc-100 font-sans flex flex-col justify-between selection:bg-blue-500/30">
        <nav className="flex items-center justify-between px-10 py-7 max-w-7xl mx-auto w-full relative z-20">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-white">WealthWise</h1>
          <div className="hidden md:flex items-center space-x-2">
            <span className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition cursor-pointer">WealthWise AI</span>
          </div>
          <div className="flex items-center space-x-6">
            <button onClick={() => { setAuthError(''); setCurrentView('login'); }} className="text-sm font-medium text-zinc-300 hover:text-white transition">Log in</button>
            <button onClick={() => { setAuthError(''); setCurrentView('signup'); }} className="text-sm font-medium bg-[#5063f4] text-white px-5 py-2.5 rounded-full hover:bg-[#4353db] transition shadow-sm">Sign up</button>
          </div>
        </nav>
        <main className="flex-1 flex flex-col items-center justify-center text-center px-4 -mt-16">
          <div className="max-w-3xl space-y-4">
            <h2 className="text-5xl md:text-6xl font-serif font-normal text-white tracking-tight leading-[1.2]">
              Introducing <span className="text-[#5d72f5] italic font-normal">WealthWise AI</span>.<br />
              <span className="text-zinc-100 font-serif">Your personal finance AI assistant.</span>
            </h2>
          </div>
          <div className="mt-10">
            <button onClick={() => { setAuthError(''); setCurrentView('login'); }} className="px-8 py-3.5 bg-[#5063f4] text-white text-sm font-medium rounded-full hover:bg-[#4353db] transition shadow-[0_0_20px_rgba(80,99,244,0.35)]">Get started</button>
          </div>
        </main>
        <div className="py-6"></div>
      </div>
    );
  }

  if (currentView === 'login' || currentView === 'signup') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md p-8 bg-zinc-900/40 border border-zinc-800/60 rounded-3xl backdrop-blur-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-white mb-2">{currentView === 'login' ? 'Log in' : 'Welcome to WealthWise'}</h1>
            <p className="text-sm text-zinc-400">{currentView === 'login' ? 'Enter your details to securely access your account.' : 'Meet WealthWise AI, your personal financial AI assistant.'}</p>
          </div>
          <form className="space-y-4" onSubmit={handleAuthSubmit}>
            {authError && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">{authError}</div>}
            {currentView === 'signup' && (
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="First Name" value={authData.firstName} onChange={(e) => setAuthData({ ...authData, firstName: e.target.value })} className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition text-white" />
                <input type="text" placeholder="Last Name" value={authData.lastName} onChange={(e) => setAuthData({ ...authData, lastName: e.target.value })} className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition text-white" />
              </div>
            )}
            <input type="email" placeholder="Email Address" value={authData.email} onChange={(e) => setAuthData({ ...authData, email: e.target.value })} className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition text-white" required />
            <div className="relative">
              <input type={showPassword ? "text" : "password"} placeholder="Password" value={authData.password} onChange={(e) => setAuthData({ ...authData, password: e.target.value })} className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl pl-4 pr-10 py-3 outline-none focus:border-zinc-500 transition text-white" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-300">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button type="submit" className="w-full py-3 bg-white text-[#0a0a0a] rounded-xl font-medium hover:bg-zinc-200 transition mt-4">{currentView === 'login' ? 'Submit' : 'Agree and continue'}</button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={() => { setAuthError(''); setCurrentView(currentView === 'login' ? 'signup' : 'login'); }} className="text-sm text-zinc-400 hover:text-white transition">
              {currentView === 'login' ? 'New to WealthWise? Sign up' : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentMonthData = monthsData.find(m => m.month_offset === currentMonthOffset);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-blue-500/30">
      <nav className="flex items-center justify-between px-8 py-5 bg-[#0a0a0a] border-b border-zinc-800/60">
        <div className="flex items-baseline space-x-2">
          <h1 className="text-xl font-semibold tracking-tight text-white">WealthWise</h1>
        </div>
        <div className="flex space-x-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800/60">
          {['chat', 'records', 'categories'].map((tab) => (
            <button key={tab} onClick={() => handleTabChange(tab)} className={`px-6 py-1.5 rounded-full text-sm font-medium transition ${activeTab === tab ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {tab === 'chat' ? 'WealthWise AI' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-6">
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative text-zinc-400 hover:text-white transition p-1">
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)] border-2 border-[#0a0a0a]"></span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-72 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-zinc-800/60">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Upcoming Bills</h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-zinc-500">No upcoming bills this week.</div>
                  ) : (
                    notifications.map((note) => (
                      <div key={note.id} className="px-4 py-3 hover:bg-zinc-800/50 transition cursor-default border-b border-zinc-800/30 last:border-0">
                        <p className="text-sm text-zinc-300">{note.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button onClick={handleLogout} title="Log out" className="w-8 h-8 bg-zinc-800 rounded-full border border-zinc-700 hover:border-zinc-500 transition flex items-center justify-center text-xs font-medium text-zinc-300">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 h-[calc(100vh-80px)]">
        {activeTab === 'records' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                <h2 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Total Balance</h2>
                <p className="text-4xl font-light text-white tracking-tight">₹ {dashboardData.total_balance.toLocaleString()}</p>
              </div>
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                <h2 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Income</h2>
                <p className="text-4xl font-light text-emerald-400 tracking-tight">₹ {dashboardData.monthly_income.toLocaleString()}</p>
              </div>
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                <h2 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Spent</h2>
                <p className="text-4xl font-light text-rose-400 tracking-tight">₹ {dashboardData.total_spent.toLocaleString()}</p>
              </div>
            </div>

            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">AI Financial Insights</h3>
                <button 
                  onClick={fetchAiAdvice}
                  disabled={loadingAdvice}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-500 transition disabled:opacity-50"
                >
                  {loadingAdvice ? 'Analyzing...' : 'Generate Monthly Report ✨'}
                </button>
              </div>

              {aiAdvice && (
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm leading-relaxed">
                  {aiAdvice}
                </div>
              )}
            </div>

            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
              <h3 className="text-xs font-medium text-zinc-400 mb-6 uppercase tracking-wider">Current Month Spending</h3>
              <div className="grid grid-cols-5 text-xs font-semibold text-zinc-500 uppercase pb-4 border-b border-zinc-800">
                <span>Date</span>
                <span className="col-span-2">Description</span>
                <span>Category</span>
                <span className="text-right">Amount</span>
              </div>
              
              {dashboardData.transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-zinc-500">No transactions recorded yet.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-1">
                  {dashboardData.transactions.map((t) => (
                    <div key={t.id} className="grid grid-cols-5 items-center text-sm text-zinc-300 py-3 border-b border-zinc-800/40">
                      <span className="text-zinc-500">{t.date}</span>
                      <span className="col-span-2 font-medium text-zinc-200">{t.description}</span>
                      <span className="text-zinc-500">{t.category}</span>
                      <span className="text-right font-medium">₹ {t.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="max-w-3xl mx-auto h-full flex flex-col rounded-2xl bg-zinc-900/20 border border-zinc-800/60 animate-in fade-in duration-300">
            <div className="px-6 py-5 border-b border-zinc-800/60 bg-zinc-900/40 rounded-t-2xl">
              <h3 className="text-sm font-medium text-zinc-200">WealthWise Assistant</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
              {!user?.is_onboarded ? (
                <>
                  <div className="px-4 py-3 rounded-2xl text-sm max-w-[85%] bg-zinc-800/60 border border-zinc-700/50 text-zinc-200 self-start rounded-tl-sm">
                    Welcome to WealthWise. I'm your financial assistant. To give you accurate insights and automate your tracking, let's establish your starting baseline.
                  </div>
                  <div className="w-full max-w-sm mt-2 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-700/60 self-start">
                    <form onSubmit={handleOnboardSubmit} className="space-y-4">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Current Total Balance (₹)</label>
                        <input type="number" required value={onboardData.balance} onChange={(e) => setOnboardData({...onboardData, balance: e.target.value})} className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Monthly Income (₹)</label>
                        <input type="number" required value={onboardData.income} onChange={(e) => setOnboardData({...onboardData, income: e.target.value})} className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Payday (Date of Month)</label>
                        <input type="number" min="1" max="31" required value={onboardData.payday} onChange={(e) => setOnboardData({...onboardData, payday: e.target.value})} placeholder="e.g. 1" className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition text-white" />
                      </div>
                      <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                        Initialize Dashboard
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                messages.map((msg, index) => (
                  <div key={index} className={`px-4 py-3 rounded-2xl text-sm max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 self-end rounded-tr-sm' : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-200 self-start rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t border-zinc-800/60 bg-zinc-900/40 rounded-b-2xl space-y-4">
              <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-hide">
                <button onClick={() => setChatInput("Set my monthly budget to ")} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition whitespace-nowrap border border-zinc-700/50">Set monthly budget 🎯</button>
                <button onClick={() => setChatInput("No expenses today! 🎉")} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition whitespace-nowrap border border-zinc-700/50">No expenses today! 🎉</button>
              </div>
              <form className="relative flex items-center" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                <input type="text" disabled={!user?.is_onboarded} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={user?.is_onboarded ? "Log an expense or ask a question..." : "Please initialize your dashboard above..."} className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-xl pl-4 pr-10 py-3.5 outline-none focus:border-zinc-500 transition text-zinc-200 placeholder-zinc-500 shadow-inner disabled:opacity-50" />
                <button type="submit" disabled={!user?.is_onboarded} className="absolute right-3 p-1 text-zinc-400 hover:text-white transition disabled:opacity-50"><Send size={18} /></button>
              </form>
            </div>
          </div>
        )}

        
        {activeTab === 'categories' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-xl font-medium text-white">Budgets & Limits</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              
              <div className="space-y-6 md:col-span-1">
                
                
                <div className="p-6 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl">
                  <h3 className="text-sm font-medium text-white mb-2">Total Monthly Budget</h3>
                  <p className="text-xs text-zinc-500 mb-4">Set a spending cap for the entire month.</p>
                  <form onSubmit={handleOverallBudgetSubmit} className="space-y-4">
                    <input 
                      type="number" 
                      required 
                      placeholder="Total Limit (₹)" 
                      value={overallLimitInput} 
                      onChange={e => setOverallLimitInput(e.target.value)} 
                      className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500" 
                    />
                    <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition">
                      Save Total Budget
                    </button>
                  </form>
                </div>

                
                <div className="p-6 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl">
                  <h3 className="text-sm font-medium text-white mb-2">Set Category Limit</h3>
                  <p className="text-xs text-zinc-500 mb-4">Restrict spending for a specific category.</p>
                  <form onSubmit={handleBudgetSubmit} className="space-y-4">
                    <input 
                      type="text" 
                      required 
                      placeholder="Category Name (e.g., Food)" 
                      value={newBudget.category} 
                      onChange={e => setNewBudget({...newBudget, category: e.target.value})} 
                      className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500" 
                    />
                    <input 
                      type="number" 
                      required 
                      placeholder="Monthly Limit (₹)" 
                      value={newBudget.limit} 
                      onChange={e => setNewBudget({...newBudget, limit: e.target.value})} 
                      className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500" 
                    />
                    <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition">
                      Save Category Limit
                    </button>
                  </form>
                </div>

              </div>

              
              <div className="space-y-4 md:col-span-2">
                
                {/* 5-Month UI Slider */}
                {monthsData.length > 0 && (
                  <div className="flex items-center justify-between bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/60">
                    <button 
                      onClick={() => {
                        setCurrentMonthOffset(prev => Math.min(prev + 1, 4));
                        setExpandedCategory(null);
                      }} 
                      disabled={currentMonthOffset === 4}
                      className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft size={20} className="text-zinc-300" />
                    </button>
                    
                    <span className="font-semibold text-zinc-100 tracking-wide">
                      {currentMonthData?.month_label}
                    </span>
                    
                    <button 
                      onClick={() => {
                        setCurrentMonthOffset(prev => Math.max(prev - 1, 0));
                        setExpandedCategory(null);
                      }} 
                      disabled={currentMonthOffset === 0}
                      className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight size={20} className="text-zinc-300" />
                    </button>
                  </div>
                )}

                
                {currentMonthData && (
                  <div className="p-5 bg-gradient-to-r from-blue-950/30 to-zinc-900/60 border border-blue-500/30 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-white">Overall Monthly Spending</span>
                      <span className="text-zinc-300">
                        ₹₹{currentMonthData.overall_spent.toLocaleString()} {currentMonthData.overall_limit > 0 ? `/ ₹${currentMonthData.overall_limit.toLocaleString()}` : '(No limit set)'}
                      </span>
                    </div>
                    {currentMonthData.overall_limit > 0 && (
                      <div className="w-full bg-[#0a0a0a] rounded-full h-2 border border-zinc-800">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${currentMonthData.overall_spent >= currentMonthData.overall_limit ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-500'}`} 
                          style={{ width: `${Math.min((currentMonthData.overall_spent / currentMonthData.overall_limit) * 100, 100)}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                )}

                
                {(!currentMonthData || !currentMonthData.categories || currentMonthData.categories.length === 0) ? (
                  <div className="p-6 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl text-center text-zinc-500 text-sm">
                    No category limits set for this month.
                  </div>
                ) : (
                  currentMonthData.categories.map(b => {
                    const isLimitZero = b.limit_amount === 0;
                    const percent = isLimitZero ? (b.spent > 0 ? 100 : 0) : Math.min((b.spent / b.limit_amount) * 100, 100);
                    const isOver = isLimitZero ? false : percent >= 90;
                    const isExpanded = expandedCategory === b.id;

                    return (
                      <div key={b.id} className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl overflow-hidden transition-all duration-200">
                        
                        
                        <div 
                          onClick={() => toggleCategoryExpand(b.id)}
                          className="p-5 cursor-pointer hover:bg-zinc-800/30 transition flex flex-col space-y-3"
                        >
                          <div className="flex justify-between items-center text-sm">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-zinc-200 text-base">{b.category}</span>
                              {isLimitZero && <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full uppercase tracking-widest">Auto</span>}
                            </div>
                            <div className="flex items-center space-x-4">
                              <span className="text-zinc-400">
                                ₹{b.spent.toLocaleString()} {isLimitZero ? "" : `/ ₹${b.limit_amount.toLocaleString()}`}
                              </span>
                              {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
                            </div>
                          </div>
                          
                          {!isLimitZero && (
                            <div className="w-full bg-[#0a0a0a] rounded-full h-1.5 border border-zinc-800">
                              <div className={`h-1.5 rounded-full ${isOver ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                            </div>
                          )}
                        </div>

                        
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-2 bg-zinc-900/20 border-t border-zinc-800/40">
                            {b.transactions.length === 0 ? (
                              <p className="text-xs text-zinc-500 italic py-2">No transactions recorded for {b.category} this month.</p>
                            ) : (
                              <div className="space-y-2">
                                {b.transactions.map(item => (
                                  <div key={item.id} className="flex justify-between text-xs py-1.5 text-zinc-300 border-b border-zinc-800/50 last:border-0">
                                    <span><span className="text-zinc-500 mr-2">{item.date}</span> {item.description}</span>
                                    <span className="font-medium text-zinc-200">₹{item.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}