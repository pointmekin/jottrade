import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'
import { LogOut, LayoutDashboard, Settings, User, Bell, Search, Menu } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const session = authClient.useSession()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.navigate({ to: '/sign-in' })
        },
      },
    })
  }

  if (session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (!session.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Access Denied</h1>
          <p className="text-slate-400">You need to be signed in to view this page.</p>
        </div>
        <button
          onClick={() => router.navigate({ to: '/sign-in' })}
          className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
        >
          Go to Sign In
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-700/50">
            <h1 className="text-2xl font-bold bg-linear-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              TradeBase
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <LayoutDashboard className="h-5 w-5" />
              <span className="font-medium">Dashboard</span>
            </a>
            <Link to="/profile" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-700/50 hover:text-slate-100 rounded-xl transition-colors">
              <User className="h-5 w-5" />
              <span className="font-medium">Profile</span>
            </Link>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-700/50 hover:text-slate-100 rounded-xl transition-colors">
              <Settings className="h-5 w-5" />
              <span className="font-medium">Settings</span>
            </a>
          </nav>

          <div className="p-4 border-t border-slate-700/50">
            <Link to="/profile" className="flex items-center gap-3 px-4 py-3 mb-2 hover:bg-slate-700/30 rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-linear-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold overflow-hidden">
                {session.data.user.image ? (
                  <img src={session.data.user.image} alt={session.data.user.name || 'User'} className="w-full h-full object-cover" />
                ) : (
                  session.data.user.name?.charAt(0) || 'U'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{session.data.user.name}</p>
                <p className="text-xs text-slate-400 truncate">{session.data.user.email}</p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1 max-w-xl mx-4 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-white relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-800"></span>
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Overview</h2>
              <p className="text-slate-400">Welcome back to your trading dashboard.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Total Balance', value: '$12,450.00', change: '+2.5%', color: 'text-green-400' },
                { label: 'Active Trades', value: '8', change: '-1', color: 'text-slate-400' },
                { label: 'Profit/Loss', value: '+$1,240.50', change: '+12%', color: 'text-green-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <p className="text-slate-400 text-sm font-medium mb-2">{stat.label}</p>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
                    <span className={`text-sm font-medium ${stat.color} bg-slate-900/50 px-2 py-1 rounded`}>
                      {stat.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 h-96 flex items-center justify-center text-slate-500">
              Chart Placeholder
            </div>
          </div>
        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
