import { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldAlert, 
  Search, 
  UserMinus, 
  Lock, 
  Unlock, 
  Edit3, 
  CheckCircle2, 
  XCircle,
  Activity,
  CreditCard,
  ArrowLeft
} from 'lucide-react';
import api from '../services/api';
import { cn } from '@/lib/utils';

interface User {
  id: number;
  email: string;
  role: string;
  status: string;
  planCount: number;
}

interface Stats {
  totalUsers: number;
  activeSignals: number;
  totalRevenue: number;
  totalSales: number;
}

interface UserPlan {
  planId: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userPlans, setUserPlans] = useState<UserPlan[]>([]);
  const [addingPlan, setAddingPlan] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (editingUser) {
      fetchUserPlans(editingUser.id);
    }
  }, [editingUser]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [uRes, sRes] = await Promise.all([
        api.get(`/admin/users?q=${search}`),
        api.get('/admin/stats')
      ]);
      setUsers(uRes.data);
      setStats(sRes.data);
    } catch (e) {
      console.error('Failed to fetch admin data', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPlans = async (userId: number) => {
    try {
      const res = await api.get(`/admin/users/${userId}/purchases`);
      setUserPlans(res.data);
    } catch (e) {
      console.error('Failed to fetch user plans');
    }
  };

  const grantPlan = async (userId: number, planId: string) => {
    try {
      await api.post(`/admin/users/${userId}/purchases`, { planId });
      fetchUserPlans(userId);
      fetchData();
      setAddingPlan(false);
    } catch (e) {
      alert('Failed to grant plan');
    }
  };

  const revokePlan = async (userId: number, planId: string) => {
    try {
      await api.delete(`/admin/users/${userId}/purchases/${planId}`);
      fetchUserPlans(userId);
      fetchData();
    } catch (e) {
      alert('Failed to revoke plan');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const toggleStatus = async (user: User) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await api.put(`/admin/users/${user.id}`, { ...user, status: newStatus });
      fetchData();
    } catch (e) {
      alert('Failed to update status');
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user? This action is IRREVERSIBLE.')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      fetchData();
    } catch (e) {
      alert('Failed to delete user');
    }
  };

  if (loading && !users.length) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <Activity className="w-12 h-12 text-cyan-500 animate-pulse" />
      </div>
    );
  }

  const availablePlans = [
    { id: 'low_risk', name: 'Low Risk ($25)' },
    { id: 'medium_risk', name: 'Medium Risk ($20)' },
    { id: 'high_risk', name: 'High Risk ($15)' },
    { id: 'bundle', name: 'Premium Bundle ($50)' },
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-cyan-500/30">
      {/* Header */}
      <nav className="border-b border-white/5 bg-slate-950/50 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div className="flex items-center gap-2">
              <ShieldAlert className="text-red-500 w-6 h-6" />
              <h1 className="text-xl font-bold tracking-tighter uppercase">Admin <span className="text-red-500">Terminal</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Elevated Privileges</span>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard 
            title="Total Users" 
            value={stats?.totalUsers || 0} 
            icon={Users} 
            color="text-blue-400" 
            sub="Platform reach"
          />
          <StatCard 
            title="Platform Revenue" 
            value={`$${stats?.totalRevenue || 0}`} 
            icon={CreditCard} 
            color="text-emerald-400" 
            sub="Lifetime sales"
          />
          <StatCard 
            title="Active Signals" 
            value={stats?.activeSignals || 0} 
            icon={Activity} 
            color="text-cyan-400" 
            sub="Live execution"
          />
          <StatCard 
            title="Total Purchases" 
            value={stats?.totalSales || 0} 
            icon={CheckCircle2} 
            color="text-purple-400" 
            sub="Conversion count"
          />
        </div>

        {/* User Management Section */}
        <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-sm">
          <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">User Management</h2>
              <p className="text-slate-400 text-sm">Review, moderate, and manage all platform accounts.</p>
            </div>
            
            <form onSubmit={handleSearch} className="relative group max-w-md w-full">
              <input 
                type="text" 
                placeholder="Search by email..." 
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all group-hover:border-white/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/30 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                  <th className="px-8 py-4">User</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Role</th>
                  <th className="px-8 py-4 text-center">Purchases</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-8 py-6">
                      <div className="font-medium text-slate-200">{user.email}</div>
                      <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">UID: {user.id}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight",
                        user.status === 'active' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-tight",
                        user.role === 'admin' ? "text-purple-400" : "text-slate-400"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-sm font-bold">{user.planCount}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => toggleStatus(user)}
                          title={user.status === 'active' ? 'Suspend User' : 'Activate User'}
                          className={cn(
                            "p-2 rounded-lg transition-colors border border-white/5",
                            user.status === 'active' ? "hover:bg-red-500/20 text-red-500" : "hover:bg-emerald-500/20 text-emerald-500"
                          )}
                        >
                          {user.status === 'active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => setEditingUser(user)}
                          title="Edit User"
                          className="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors border border-white/5"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteUser(user.id)}
                          title="Delete User"
                          className="p-2 rounded-lg hover:bg-orange-500/20 text-orange-400 transition-colors border border-white/5"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {users.length === 0 && !loading && (
            <div className="p-12 text-center">
              <XCircle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <div className="text-slate-500">No users found matching your search.</div>
            </div>
          )}
        </div>
      </main>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 shadow-2xl shadow-black">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-950/30">
              <div>
                <h3 className="text-xl font-bold">Manage Account</h3>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">{editingUser.email}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 custom-scrollbar">
              {/* Plans Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Subscription Mastery</h4>
                  </div>
                  <button 
                    onClick={() => setAddingPlan(!addingPlan)}
                    className="text-[10px] font-bold text-cyan-400 uppercase tracking-tighter hover:text-cyan-300"
                  >
                    {addingPlan ? 'Cancel' : '+ Grant New Plan'}
                  </button>
                </div>

                <div className="space-y-3">
                  {addingPlan && (
                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-2 animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 gap-1">
                        {availablePlans.map(plan => {
                          const hasIt = userPlans.some(up => up.planId === plan.id);
                          return (
                            <button
                              key={plan.id}
                              disabled={hasIt}
                              onClick={() => grantPlan(editingUser.id, plan.id)}
                              className={cn(
                                "flex items-center justify-between px-4 py-3 rounded-xl transition-all text-sm",
                                hasIt ? "opacity-30 cursor-not-allowed bg-slate-950/50" : "hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-400"
                              )}
                            >
                              <span>{plan.name}</span>
                              <CheckCircle2 className={cn("w-4 h-4", hasIt ? "text-slate-700" : "text-cyan-500 opacity-0 group-hover:opacity-100")} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-950/50 border border-white/5 rounded-2xl divide-y divide-white/5">
                    {userPlans.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-sm">No active subscriptions</div>
                    ) : (
                      userPlans.map(plan => (
                        <div key={plan.planId} className="flex items-center justify-between p-4 group">
                          <div>
                            <div className="text-sm font-bold uppercase tracking-tight text-slate-200">{plan.planId.replace('_', ' ')}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Granted: {new Date(plan.timestamp).toLocaleDateString()}</div>
                          </div>
                          <button 
                            onClick={() => revokePlan(editingUser.id, plan.planId)}
                            className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <div className="pt-4">
                <button 
                  onClick={() => setEditingUser(null)}
                  className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-slate-200 transition-all hover:scale-[1.01] active:scale-95 shadow-xl shadow-white/5"
                >
                  Done Managing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, sub }: any) {
  return (
    <div className="p-6 bg-slate-900/50 border border-white/5 rounded-3xl relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 group-hover:scale-125 transition-all">
        <Icon className={cn("w-16 h-16", color)} />
      </div>
      <div className="relative z-10">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</div>
        <div className={cn("text-3xl font-bold mb-1 tracking-tighter", color)}>{value}</div>
        <div className="text-[10px] text-slate-500 uppercase font-semibold">{sub}</div>
      </div>
    </div>
  );
}
