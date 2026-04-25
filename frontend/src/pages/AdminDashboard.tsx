import { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  Activity, 
  ShieldAlert, 
  X, 
  TrendingUp, 
  Zap, 
  ArrowLeft,
  MessageSquare,
  Gift,
  Tag
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../services/api';
import SupportChat from '../components/admin/SupportChat';

interface User {
  id: number;
  email: string;
  role: string;
  purchasedPlans: string[];
  createdAt: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalSales: 0, totalRevenue: 0, activeSignals: 0 });
  const [filter, setFilter] = useState<'all' | 'premium' | 'trial'>('all');
  const [activeTab, setActiveTab] = useState<'operators' | 'support' | 'marketing'>('operators');
  const [marketingData, setMarketingData] = useState<{ events: any[], offers: any[] }>({ events: [], offers: [] });

  useEffect(() => {
    fetchData();
    fetchStats();
    fetchMarketing();
  }, []);

  const fetchMarketing = async () => {
    try {
      const [eventsRes, offersRes] = await Promise.all([
        api.get('/admin/marketing/events'),
        api.get('/admin/marketing/offers')
      ]);
      setMarketingData({ events: eventsRes.data, offers: offersRes.data });
    } catch (e) {
      console.error('Failed to fetch marketing data', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data);
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (e) {
      console.error('Failed to fetch admin data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await api.put(`/admin/users/${userId}`, { role });
      fetchData();
      setSelectedUser(prev => prev ? { ...prev, role } : null);
    } catch (e) {
      alert('Failed to update role');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', { email: newEmail, password: newPassword });
      setNewEmail('');
      setNewPassword('');
      setIsCreateModalOpen(false);
      fetchData();
      fetchStats();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to PERMANENTLY delete this operator? All their data will be lost.')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      fetchData();
      fetchStats();
    } catch (e) {
      alert('Failed to delete user');
    }
  };

  const handlePlanToggle = async (userId: number, planId: string, hasPlan: boolean) => {
    try {
      if (hasPlan) {
        await api.delete(`/admin/users/${userId}/purchases/${planId}`);
        setSelectedUser(prev => prev ? {
          ...prev,
          purchasedPlans: prev.purchasedPlans.filter(p => p !== planId)
        } : null);
      } else {
        await api.post(`/admin/users/${userId}/purchases`, { planId });
        setSelectedUser(prev => prev ? {
          ...prev,
          purchasedPlans: [...(prev.purchasedPlans || []), planId]
        } : null);
      }
      fetchData();
      fetchStats();
    } catch (e) {
      alert('Failed to update plan');
    }
  };

  const plans = [
    { id: 'low_risk', name: '$25' },
    { id: 'medium_risk', name: '$20' },
    { id: 'high_risk', name: '$15' },
    { id: 'bundle', name: '$50' },
  ];

  if (loading && !users.length) {
    return (
      <div className="min-h-screen bg-cyber-dark flex items-center justify-center">
        <Activity className="w-12 h-12 text-cyan-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-dark text-slate-200 pb-20 relative overflow-hidden">
      {/* Admin Background Ambience */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto px-6 pt-12 space-y-12 relative z-10">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-2 text-red-500">
               <ShieldAlert className="w-5 h-5 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
               <span className="text-[10px] font-black uppercase tracking-[0.2em]">Restricted Command Center</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-white">
              Master <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400">Control</span>
            </h1>
            <p className="text-slate-400 text-lg font-medium max-w-xl">Global system oversight, user authorization, and infrastructure management.</p>
          </div>

          <div className="flex gap-4">
             <button 
               onClick={() => setActiveTab(activeTab === 'operators' ? 'support' : 'operators')}
               className={`glass-card px-8 py-4 flex items-center gap-3 transition-all cursor-pointer group border-none ${
                 activeTab === 'support' ? 'bg-cyan-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
               }`}
             >
                <MessageSquare className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-widest">
                  {activeTab === 'support' ? 'View Operators' : 'Support Chat'}
                </span>
             </button>
             <button 
               onClick={() => setActiveTab('marketing')}
               className={`glass-card px-8 py-4 flex items-center gap-3 transition-all cursor-pointer group border-none ${
                 activeTab === 'marketing' ? 'bg-purple-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
               }`}
             >
                <Tag className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-widest">Marketing</span>
             </button>
             <button 
               onClick={() => setIsCreateModalOpen(true)}
               className="glass-card px-8 py-4 bg-white text-black flex items-center gap-3 hover:bg-slate-200 transition-all cursor-pointer group border-none"
             >
                <Users className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-widest">Create Operator</span>
             </button>
             <Link to="/dashboard" className="glass-card px-8 py-4 flex items-center gap-3 hover:border-cyan-500/30 transition-all cursor-pointer group">
                <ArrowLeft className="text-cyan-400 w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-black uppercase tracking-widest text-white">Back to Dashboard</span>
             </Link>
          </div>
        </header>

        {/* System Health Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <AdminStat title="Total Operators" value={stats.totalUsers} icon={Users} color="text-cyan-400" />
          <AdminStat title="Total Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} icon={TrendingUp} color="text-emerald-400" />
          <AdminStat title="Active Signals" value={stats.activeSignals} icon={Zap} color="text-yellow-400" />
          <AdminStat title="Total Sales" value={stats.totalSales} icon={Activity} color="text-purple-400" />
        </div>

        {activeTab === 'support' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <SupportChat />
          </motion.div>
        ) : activeTab === 'marketing' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {/* Events Section */}
            <div className="glass-card overflow-hidden border-white/5">
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                    <Gift className="text-purple-400" />
                    Trial Events
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">Configure limited-time free trials for new operators.</p>
                </div>
                <button 
                  onClick={() => {
                    const name = prompt('Event Name:');
                    const planId = prompt('Plan ID (low_risk, medium_risk, high_risk, bundle):');
                    const trialDays = prompt('Trial Duration (days):');
                    const startDate = prompt('Start Date (YYYY-MM-DD):');
                    const endDate = prompt('End Date (YYYY-MM-DD):');
                    if (name && planId && trialDays && startDate && endDate) {
                      api.post('/admin/marketing/events', { name, planId, trialDays: parseInt(trialDays), startDate, endDate })
                        .then(() => fetchMarketing());
                    }
                  }}
                  className="px-6 py-3 bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-400 transition-all"
                >
                  Create Event
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Event</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Plan</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Duration</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Timeline</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {marketingData.events.map(event => (
                      <tr key={event.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-8 py-6 font-bold text-white text-sm">{event.name}</td>
                        <td className="px-8 py-6">
                           <span className="text-[10px] font-bold text-slate-400 bg-white/5 py-1 px-2 rounded-lg border border-white/5 uppercase">
                              {event.planId.replace('_', ' ')}
                            </span>
                        </td>
                        <td className="px-8 py-6 text-sm text-purple-400 font-bold">{event.trialDays} Days</td>
                        <td className="px-8 py-6 text-[10px] text-slate-500 font-mono">
                          {event.startDate.split('T')[0]} to {event.endDate.split('T')[0]}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={() => api.delete(`/admin/marketing/events/${event.id}`).then(() => fetchMarketing())}
                            className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Offers Section */}
            <div className="glass-card overflow-hidden border-white/5">
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                    <Tag className="text-emerald-400" />
                    Discount Offers
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">Apply strategic price reductions to attract more users.</p>
                </div>
                <button 
                  onClick={() => {
                    const planId = prompt('Plan ID (low_risk, medium_risk, high_risk, bundle):');
                    const discountPercentage = prompt('Discount %:');
                    const startDate = prompt('Start Date (YYYY-MM-DD):');
                    const endDate = prompt('End Date (YYYY-MM-DD):');
                    if (planId && discountPercentage && startDate && endDate) {
                      api.post('/admin/marketing/offers', { planId, discountPercentage: parseInt(discountPercentage), startDate, endDate })
                        .then(() => fetchMarketing());
                    }
                  }}
                  className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
                >
                  Create Offer
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Plan</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Discount</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Timeline</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {marketingData.offers.map(offer => (
                      <tr key={offer.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-8 py-6">
                           <span className="text-[10px] font-bold text-slate-400 bg-white/5 py-1 px-2 rounded-lg border border-white/5 uppercase">
                              {offer.planId.replace('_', ' ')}
                            </span>
                        </td>
                        <td className="px-8 py-6">
                           <span className="text-sm font-black text-emerald-400">-{offer.discountPercentage}% OFF</span>
                        </td>
                        <td className="px-8 py-6 text-[10px] text-slate-500 font-mono">
                          {offer.startDate.split('T')[0]} to {offer.endDate.split('T')[0]}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={() => api.delete(`/admin/marketing/offers/${offer.id}`).then(() => fetchMarketing())}
                            className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card overflow-hidden border-white/5"
          >
            <div className="p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/[0.01]">
              <div>
                 <h2 className="text-2xl font-black tracking-tight text-white">Operator Registry</h2>
                 <p className="text-slate-500 text-sm font-medium">Manage user permissions and monitor subscription health.</p>
              </div>
              <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
                 <button 
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-white text-black' : 'hover:bg-white/5 text-slate-400'}`}
                 >
                   All
                 </button>
                 <button 
                  onClick={() => setFilter('premium')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'premium' ? 'bg-white text-black' : 'hover:bg-white/5 text-slate-400'}`}
                 >
                   Premium
                 </button>
                 <button 
                  onClick={() => setFilter('trial')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'trial' ? 'bg-white text-black' : 'hover:bg-white/5 text-slate-400'}`}
                 >
                   Trial
                 </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Operator</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Clearance</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Active Plans</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Joint Date</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-white/5">
                {users.filter(u => {
                  if (filter === 'premium') return u.purchasedPlans?.length > 0;
                  if (filter === 'trial') return !u.purchasedPlans || u.purchasedPlans.length === 0;
                  return true;
                }).map((u, idx) => (
                  <motion.tr 
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center text-sm font-bold text-white uppercase group-hover:border-cyan-500/30 transition-all">
                          {u.email[0]}
                        </div>
                        <div className="font-bold text-white text-sm group-hover:text-cyan-400 transition-colors">{u.email}</div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        u.role === 'admin' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20'
                      }`}>
                        {u.role}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {u.purchasedPlans?.length > 0 ? (
                          u.purchasedPlans.map((p: string) => (
                            <span key={p} className="text-[10px] font-bold text-slate-400 bg-white/5 py-1 px-2 rounded-lg border border-white/5">
                              {p.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-600 font-bold italic">No active clearance</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm text-slate-500 font-medium font-mono">
                       {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                     <td className="px-8 py-6 text-right">
                       <div className="flex justify-end gap-2">
                         <button 
                          onClick={() => setSelectedUser(u)}
                          className="p-3 bg-white/5 hover:bg-white text-slate-400 hover:text-black rounded-xl transition-all group/btn"
                         >
                            <Settings className="w-5 h-5 group-hover/btn:rotate-90 transition-transform duration-500" />
                         </button>
                         <button 
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-3 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all"
                         >
                            <X className="w-5 h-5" />
                         </button>
                       </div>
                     </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          </motion.div>
        )}
      </div>

      {/* Create Account Overlay */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
           <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-md p-8 shadow-2xl border-white/10"
           >
              <div className="flex justify-between items-start mb-8">
                 <div>
                    <h2 className="text-3xl font-black tracking-tight text-white mb-1">New Operator</h2>
                    <p className="text-slate-500 text-sm font-medium">Provision a new tactical interface account.</p>
                 </div>
                 <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <X className="text-slate-500" />
                 </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-6">
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Satellite Email</label>
                    <input 
                      type="email" 
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all"
                      placeholder="operator@britsync.co"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Secure Encryption Key</label>
                    <input 
                      type="password" 
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all"
                      placeholder="••••••••"
                    />
                 </div>
                 <button 
                  type="submit"
                  className="w-full h-14 bg-cyan-500 text-white rounded-2xl mt-8 font-black text-xs uppercase tracking-widest hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/20"
                >
                   Deploy Account
                </button>
              </form>
           </motion.div>
        </div>
      )}

      {/* Account Settings Overlay */}
      {selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
           <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-xl p-8 shadow-2xl border-white/10"
           >
              <div className="flex justify-between items-start mb-8">
                 <div>
                    <h2 className="text-3xl font-black tracking-tight text-white mb-1">Modify Clearance</h2>
                    <p className="text-slate-500 text-sm font-medium">{selectedUser.email}</p>
                 </div>
                 <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <X className="text-slate-500" />
                 </button>
              </div>

              <div className="space-y-8">
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 block">Authorization Tier</label>
                    <div className="grid grid-cols-2 gap-4">
                       {['user', 'admin'].map(role => (
                          <button
                            key={role}
                            onClick={() => handleRoleChange(selectedUser!.id, role)}
                            className={`py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                              selectedUser.role === role ? 'bg-cyan-500 text-white border-cyan-400 shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-slate-500 border-white/5 hover:border-white/10'
                            }`}
                          >
                             {role}
                          </button>
                       ))}
                    </div>
                 </div>

                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 block">Permitted Strategies</label>
                    <div className="grid grid-cols-2 gap-3">
                       {plans.map(plan => {
                          const hasPlan = selectedUser?.purchasedPlans?.includes(plan.id);
                          return (
                             <button
                                key={plan.id}
                                onClick={() => handlePlanToggle(selectedUser!.id, plan.id, hasPlan || false)}
                                className={`p-4 rounded-xl text-left border transition-all ${
                                   hasPlan ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-white/[0.02] text-slate-500 border-white/5 hover:border-white/10'
                                }`}
                             >
                                <div className="text-[10px] font-black uppercase tracking-widest mb-1">{plan.id.replace('_', ' ')}</div>
                                <div className="text-xs font-bold">{plan.name}</div>
                             </button>
                          );
                       })}
                    </div>
                 </div>
              </div>

              <button 
                onClick={() => setSelectedUser(null)}
                className="w-full h-14 bg-white text-black rounded-2xl mt-12 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                 Commit Changes
              </button>
           </motion.div>
        </div>
      )}
    </div>
  );
}

function AdminStat({ title, value, icon: Icon, color }: any) {
  return (
    <div className="glass-card p-8 group hover:border-white/20 transition-all relative overflow-hidden">
      <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-700">
        <Icon size={120} />
      </div>
      <div className="relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{title}</div>
        <div className={`text-4xl font-black tracking-tighter ${color}`}>{value}</div>
      </div>
    </div>
  );
}
