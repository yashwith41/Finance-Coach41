import React, { useState } from 'react';
import { Bell, Send, Eye, EyeOff } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [activeTab, setActiveTab] = useState('chat');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'How can I help you today?' }
  ]);
  const [showPassword, setShowPassword] = useState(false);

  const [authData, setAuthData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    const endpoint = currentView === 'signup' ? '/auth/signup' : '/auth/login';
    const body = currentView === 'signup'
      ? {
          first_name: authData.firstName,
          last_name: authData.lastName,
          email: authData.email,
          password: authData.password
        }
      : {
          email: authData.email,
          password: authData.password
        };

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
    } catch (err) {
      setAuthError('Cannot connect to backend server. Make sure FastAPI is running.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wealthwise_token');
    setUser(null);
    setCurrentView('landing');
  };

  const handleSend = async () => {
    if (!chatInput.trim()) return;
    const userText = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput('');

    try {
      const response = await fetch(`http://localhost:8000/chat/log?user_text=${encodeURIComponent(userText)}`, { method: 'POST' });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Server error. Make sure FastAPI is running.' }]);
    }
  };

  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-zinc-100 font-sans flex flex-col justify-between selection:bg-blue-500/30">
        <nav className="relative z-20 flex items-center justify-between px-10 py-7 max-w-7xl mx-auto w-full">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-white">WealthWise</h1>
          
          <div className="hidden md:flex items-center space-x-2">
            <span className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition cursor-pointer">
              WealthWise AI
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <button 
              onClick={() => { setAuthError(''); setCurrentView('login'); }} 
              className="text-sm font-medium text-zinc-300 hover:text-white transition"
            >
              Log in
            </button>
            <button 
              onClick={() => { setAuthError(''); setCurrentView('signup'); }} 
              className="text-sm font-medium bg-[#5063f4] text-white px-5 py-2.5 rounded-full hover:bg-[#4353db] transition shadow-sm"
            >
              Sign up
            </button>
          </div>
        </nav>

        <main className="flex-1 flex flex-col items-center justify-center text-center px-4 -mt-16">
          <div className="max-w-3xl space-y-4">
            <h2 className="text-5xl md:text-6xl font-serif font-normal text-white tracking-tight leading-[1.2]">
              Introducing <span className="text-[#5d72f5] italic font-normal">WealthWise AI</span>.
              <br />
              <span className="text-zinc-100 font-serif">Your personal finance AI assistant.</span>
            </h2>
          </div>

          <div className="mt-10">
            <button 
              onClick={() => { setAuthError(''); setCurrentView('login'); }} 
              className="px-8 py-3.5 bg-[#5063f4] text-white text-sm font-medium rounded-full hover:bg-[#4353db] transition shadow-[0_0_20px_rgba(80,99,244,0.35)]"
            >
              Get started
            </button>
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
            <h1 className="text-2xl font-semibold text-white mb-2">
              {currentView === 'login' ? 'Log in' : 'Welcome to WealthWise'}
            </h1>
            <p className="text-sm text-zinc-400">
              {currentView === 'login' ? 'Enter your details to securely access your account.' : 'Meet WealthWise AI, your personal financial AI assistant.'}
            </p>
          </div>
          
          <form className="space-y-4" onSubmit={handleAuthSubmit}>
            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                {authError}
              </div>
            )}

            {currentView === 'signup' && (
              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="text" 
                  placeholder="First Name" 
                  value={authData.firstName}
                  onChange={(e) => setAuthData({ ...authData, firstName: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition text-white" 
                />
                <input 
                  type="text" 
                  placeholder="Last Name" 
                  value={authData.lastName}
                  onChange={(e) => setAuthData({ ...authData, lastName: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition text-white" 
                />
              </div>
            )}

            <input 
              type="email" 
              placeholder="Email Address" 
              value={authData.email}
              onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition text-white" 
              required 
            />

            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="Password" 
                value={authData.password}
                onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm rounded-xl pl-4 pr-10 py-3 outline-none focus:border-zinc-500 transition text-white" 
                required 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            
            {currentView === 'login' && (
              <div className="flex justify-end">
                <button type="button" className="text-xs text-zinc-400 hover:text-white transition">
                  Forgot password?
                </button>
              </div>
            )}
            
            <button 
              type="submit" 
              className="w-full py-3 bg-white text-[#0a0a0a] rounded-xl font-medium hover:bg-zinc-200 transition mt-4"
            >
              {currentView === 'login' ? 'Submit' : 'Agree and continue'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setAuthError('');
                setCurrentView(currentView === 'login' ? 'signup' : 'login');
              }} 
              className="text-sm text-zinc-400 hover:text-white transition"
            >
              {currentView === 'login' ? 'New to WealthWise? Sign up' : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-blue-500/30">
      <nav className="flex items-center justify-between px-8 py-5 bg-[#0a0a0a] border-b border-zinc-800/60">
        <div className="flex items-baseline space-x-2">
          <h1 className="text-xl font-semibold tracking-tight text-white">WealthWise</h1>
        </div>
        
        <div className="flex space-x-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800/60">
          {['chat', 'records', 'categories'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-1.5 rounded-full text-sm font-medium transition ${activeTab === tab ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {tab === 'chat' ? 'WealthWise AI' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-6">
          <button className="relative text-zinc-400 hover:text-white transition">
            <Bell size={20} />
            <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
          </button>
          <button 
            onClick={handleLogout} 
            title="Log out" 
            className="w-8 h-8 bg-zinc-800 rounded-full border border-zinc-700 hover:border-zinc-500 transition flex items-center justify-center text-xs font-medium text-zinc-300"
          >
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
                <p className="text-4xl font-light text-white tracking-tight">₹ 42,500</p>
              </div>
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                <h2 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Income</h2>
                <p className="text-4xl font-light text-emerald-400 tracking-tight">₹ 65,000</p>
              </div>
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                <h2 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Spent</h2>
                <p className="text-4xl font-light text-rose-400 tracking-tight">₹ 22,500</p>
              </div>
            </div>

            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
              <h3 className="text-xs font-medium text-zinc-400 mb-6 uppercase tracking-wider">Current Month Spending</h3>
              <div className="grid grid-cols-5 text-xs font-semibold text-zinc-500 uppercase pb-4 border-b border-zinc-800">
                <span>Date</span>
                <span className="col-span-2">Description</span>
                <span>Category</span>
                <span className="text-right">Amount</span>
              </div>
              <div className="mt-4 space-y-1">
                <div className="grid grid-cols-5 items-center text-sm text-zinc-300 py-3 border-b border-zinc-800/40">
                  <span className="text-zinc-500">Sep 20</span>
                  <span className="col-span-2 font-medium text-zinc-200">Netflix Subscription</span>
                  <span className="text-zinc-500">Entertainment</span>
                  <span className="text-right font-medium">₹ 499</span>
                </div>
                <div className="grid grid-cols-5 items-center text-sm text-zinc-300 py-3 border-b border-zinc-800/40">
                  <span className="text-zinc-500">Sep 19</span>
                  <span className="col-span-2 font-medium text-zinc-200">Auto Rickshaw</span>
                  <span className="text-zinc-500">Transport</span>
                  <span className="text-right font-medium">₹ 120</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="max-w-3xl mx-auto h-full flex flex-col rounded-2xl bg-zinc-900/20 border border-zinc-800/60 animate-in fade-in duration-300">
            <div className="px-6 py-5 border-b border-zinc-800/60 bg-zinc-900/40 rounded-t-2xl">
              <h3 className="text-sm font-medium text-zinc-200">WealthWise Assistant</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
              {messages.map((msg, index) => (
                <div key={index} className={`px-4 py-3 rounded-2xl text-sm max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 self-end rounded-tr-sm' : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-200 self-start rounded-tl-sm'}`}>
                  {msg.text}
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-zinc-800/60 bg-zinc-900/40 rounded-b-2xl space-y-4">
              <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-hide">
                <button onClick={() => setChatInput("Set a savings goal for this month")} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition whitespace-nowrap border border-zinc-700/50">
                  Set a savings goal
                </button>
                <button onClick={() => setChatInput("No expenses today! 🎉")} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition whitespace-nowrap border border-zinc-700/50">
                  No expenses today! 🎉
                </button>
              </div>
              <form className="relative flex items-center" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Log an expense or ask a question..." className="w-full bg-[#0a0a0a] border border-zinc-700 text-sm rounded-xl pl-4 pr-10 py-3.5 outline-none focus:border-zinc-500 transition text-zinc-200 placeholder-zinc-500 shadow-inner" />
                <button type="submit" className="absolute right-3 p-1 text-zinc-400 hover:text-white transition"><Send size={18} /></button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="animate-in fade-in duration-300">
            <h2 className="text-xl font-medium text-white mb-6">Expense Categories</h2>
            <div className="grid grid-cols-4 gap-4">
              {['Food', 'Transport', 'Entertainment', 'Rent'].map(cat => (
                <div key={cat} className="p-4 bg-zinc-900/40 border border-zinc-800/60 rounded-xl text-center text-zinc-300 font-medium">
                  {cat}
                </div>
              ))}
              <button className="p-4 bg-[#0a0a0a] border border-dashed border-zinc-700 rounded-xl text-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition font-medium flex items-center justify-center">
                + Add Custom
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}