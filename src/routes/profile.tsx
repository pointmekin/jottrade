import { createFileRoute, Link } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'
import { ArrowLeft, User, Mail, Shield, Camera } from 'lucide-react'

export const Route = createFileRoute('/profile')({
  component: Profile,
})

function Profile() {
  const session = authClient.useSession()

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
        <Link
          to="/sign-in"
          className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
        >
          Go to Sign In
        </Link>
      </div>
    )
  }

  const user = session.data.user

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto p-6 lg:p-10">
        <div className="mb-8">
          <Link 
            to="/dashboard" 
            className="inline-flex items-center text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-white">Profile Settings</h1>
          <p className="text-slate-400 mt-2">Manage your account information and preferences.</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden">
          {/* Header / Cover */}
          <div className="h-32 bg-linear-to-r from-cyan-500/20 to-blue-500/20 border-b border-slate-700/50 relative">
            <div className="absolute -bottom-12 left-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-slate-800 flex items-center justify-center text-3xl font-bold text-white overflow-hidden">
                  {user.image ? (
                    <img src={user.image} alt={user.name || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-linear-to-tr from-cyan-500 to-blue-500 flex items-center justify-center">
                      {user.name?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
                <button className="absolute bottom-0 right-0 p-1.5 bg-slate-700 hover:bg-slate-600 rounded-full border-2 border-slate-800 text-white transition-colors">
                  <Camera className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-16 px-8 pb-8">
            <div className="grid gap-8">
              {/* Personal Information */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <User className="h-5 w-5 text-cyan-400" />
                  Personal Information
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Full Name</label>
                    <div className="p-3 bg-slate-900/50 border border-slate-700 rounded-xl text-slate-100">
                      {user.name}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Email Address</label>
                    <div className="p-3 bg-slate-900/50 border border-slate-700 rounded-xl text-slate-100 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-500" />
                      {user.email}
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-slate-700/50"></div>

              {/* Account Security */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-cyan-400" />
                  Account Security
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700 rounded-xl">
                    <div>
                      <h3 className="font-medium text-white">Password</h3>
                      <p className="text-sm text-slate-400">Last changed 3 months ago</p>
                    </div>
                    <button className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors">
                      Change Password
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700 rounded-xl">
                    <div>
                      <h3 className="font-medium text-white">Two-Factor Authentication</h3>
                      <p className="text-sm text-slate-400">Add an extra layer of security to your account</p>
                    </div>
                    <button className="px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20 rounded-lg transition-colors">
                      Enable 2FA
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
