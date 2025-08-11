'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Target, 
  Activity, 
  Award, 
  AlertTriangle,
  BarChart3,
  PieChart,
  Settings,
  User,
  Home,
  FileText,
  Lightbulb,
  Bell,
  Search,
  ChevronRight,
  Zap,
  Crown
} from 'lucide-react';
import Link from 'next/link';

// Mock data for demonstration
const mockData = {
  companyHealth: {
    score: 85,
    status: 'excellent',
    trend: 'up'
  },
  kpis: {
    revenue: { value: '$2.4M', change: '+12.5%', trend: 'up' },
    growth: { value: '18.3%', change: '+2.1%', trend: 'up' },
    targets: { achieved: 87, total: 100, percentage: 87 },
    users: { value: '12.4K', change: '+8.2%', trend: 'up' }
  },
  topPerformers: [
    { name: 'Sarah Chen', score: 98, department: 'Sales', avatar: 'SC' },
    { name: 'Mike Johnson', score: 95, department: 'Marketing', avatar: 'MJ' },
    { name: 'Lisa Wang', score: 92, department: 'Product', avatar: 'LW' }
  ],
  recentActivity: [
    { action: 'Q4 Revenue Target Achieved', time: '2 hours ago', type: 'success' },
    { action: 'New KPI Dashboard Created', time: '4 hours ago', type: 'info' },
    { action: 'Team Performance Review', time: '6 hours ago', type: 'warning' }
  ],
  alerts: [
    { message: 'Customer satisfaction below threshold', type: 'warning', urgent: true },
    { message: 'Monthly targets 95% complete', type: 'success', urgent: false }
  ]
};

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    // Check authentication
    const email = localStorage.getItem('userEmail');
    if (!email) {
      router.push('/');
      return;
    }
    setUserEmail(email);
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Navigation Bar */}
      <nav className="bg-black/50 backdrop-blur-lg border-b border-gray-800/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  REBEL X
                </h1>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/home" className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors">
                <Home className="w-4 h-4" />
                <span>Home</span>
              </Link>
              <Link href="/kpis" className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                <BarChart3 className="w-4 h-4" />
                <span>KPIs</span>
              </Link>
              <Link href="/reports" className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                <FileText className="w-4 h-4" />
                <span>Reports</span>
              </Link>
              <Link href="/insights" className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                <Lightbulb className="w-4 h-4" />
                <span>Insights</span>
              </Link>
              <Link href="/databases" className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                <Settings className="w-4 h-4" />
                <span>Databases</span>
              </Link>
            </div>

            {/* User Profile */}
            <div className="flex items-center space-x-4">
              <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
              </button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm text-gray-300 hidden sm:block">{userEmail.split('@')[0]}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-green-400 bg-clip-text text-transparent">
              Rebel X
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-2">Your Business, At a Glance</p>
          <p className="text-gray-400 text-lg">Real-time insights. Smarter decisions.</p>
        </div>

        {/* Company Health Score */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Company Health Score</h2>
              <div className={`flex items-center space-x-2 ${mockData.companyHealth.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                {mockData.companyHealth.trend === 'up' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                <span className="font-medium">{mockData.companyHealth.status}</span>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-gray-700"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 45}`}
                    strokeDashoffset={`${2 * Math.PI * 45 * (1 - mockData.companyHealth.score / 100)}`}
                    className="text-green-400 transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{mockData.companyHealth.score}</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="w-3 h-3 bg-green-400 rounded-full mx-auto mb-2 animate-pulse"></div>
                    <p className="text-xs text-gray-400">Excellent</p>
                  </div>
                  <div className="text-center">
                    <div className="w-3 h-3 bg-yellow-400 rounded-full mx-auto mb-2"></div>
                    <p className="text-xs text-gray-400">Good</p>
                  </div>
                  <div className="text-center">
                    <div className="w-3 h-3 bg-orange-400 rounded-full mx-auto mb-2"></div>
                    <p className="text-xs text-gray-400">Fair</p>
                  </div>
                  <div className="text-center">
                    <div className="w-3 h-3 bg-red-400 rounded-full mx-auto mb-2"></div>
                    <p className="text-xs text-gray-400">Poor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 backdrop-blur-lg rounded-xl p-6 border border-blue-500/30 hover:border-blue-400/50 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/30 transition-colors">
                <DollarSign className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex items-center space-x-1 text-green-400">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">{mockData.kpis.revenue.change}</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{mockData.kpis.revenue.value}</h3>
            <p className="text-gray-400 text-sm">Total Revenue</p>
          </div>

          <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 backdrop-blur-lg rounded-xl p-6 border border-green-500/30 hover:border-green-400/50 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg group-hover:bg-green-500/30 transition-colors">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex items-center space-x-1 text-green-400">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">{mockData.kpis.growth.change}</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{mockData.kpis.growth.value}</h3>
            <p className="text-gray-400 text-sm">Growth Rate</p>
          </div>

          <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 backdrop-blur-lg rounded-xl p-6 border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
                <Target className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex items-center space-x-1 text-green-400">
                <span className="text-sm font-medium">{mockData.kpis.targets.percentage}%</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{mockData.kpis.targets.achieved}/{mockData.kpis.targets.total}</h3>
            <p className="text-gray-400 text-sm">Targets Achieved</p>
          </div>

          <div className="bg-gradient-to-br from-orange-600/20 to-orange-800/20 backdrop-blur-lg rounded-xl p-6 border border-orange-500/30 hover:border-orange-400/50 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-orange-500/20 rounded-lg group-hover:bg-orange-500/30 transition-colors">
                <Users className="w-6 h-6 text-orange-400" />
              </div>
              <div className="flex items-center space-x-1 text-green-400">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">{mockData.kpis.users.change}</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{mockData.kpis.users.value}</h3>
            <p className="text-gray-400 text-sm">Active Users</p>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Top Performers */}
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <Award className="w-5 h-5 text-yellow-400" />
                <span>Top Performers</span>
              </h3>
              <button className="text-blue-400 hover:text-blue-300 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {mockData.topPerformers.map((performer, index) => (
                <div key={index} className="flex items-center space-x-4 p-3 rounded-lg bg-gray-800/30 hover:bg-gray-700/30 transition-colors">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-white">{performer.avatar}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{performer.name}</p>
                    <p className="text-gray-400 text-sm">{performer.department}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{performer.score}</p>
                    <p className="text-gray-400 text-xs">Score</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <Activity className="w-5 h-5 text-blue-400" />
                <span>Recent Activity</span>
              </h3>
              <button className="text-blue-400 hover:text-blue-300 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {mockData.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-800/30 hover:bg-gray-700/30 transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.type === 'success' ? 'bg-green-400' : 
                    activity.type === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'
                  }`}></div>
                  <div className="flex-1">
                    <p className="text-white text-sm">{activity.action}</p>
                    <p className="text-gray-400 text-xs">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts & Notifications */}
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <span>Alerts</span>
              </h3>
              <button className="text-blue-400 hover:text-blue-300 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {mockData.alerts.map((alert, index) => (
                <div key={index} className={`p-4 rounded-lg border ${
                  alert.type === 'warning' 
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' 
                    : 'bg-green-500/10 border-green-500/30 text-green-300'
                } ${alert.urgent ? 'animate-pulse' : ''}`}>
                  <div className="flex items-start space-x-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      alert.type === 'warning' ? 'bg-yellow-400' : 'bg-green-400'
                    }`}></div>
                    <p className="text-sm flex-1">{alert.message}</p>
                    {alert.urgent && <Zap className="w-4 h-4 text-yellow-400" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/kpis" className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 backdrop-blur-lg rounded-xl p-4 border border-blue-500/30 hover:border-blue-400/50 transition-all duration-300 group text-center">
            <BarChart3 className="w-8 h-8 text-blue-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white font-medium">View KPIs</p>
          </Link>
          <Link href="/reports" className="bg-gradient-to-br from-green-600/20 to-green-800/20 backdrop-blur-lg rounded-xl p-4 border border-green-500/30 hover:border-green-400/50 transition-all duration-300 group text-center">
            <FileText className="w-8 h-8 text-green-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white font-medium">Reports</p>
          </Link>
          <Link href="/insights" className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 backdrop-blur-lg rounded-xl p-4 border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 group text-center">
            <Lightbulb className="w-8 h-8 text-purple-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white font-medium">Insights</p>
          </Link>
          <Link href="/databases" className="bg-gradient-to-br from-orange-600/20 to-orange-800/20 backdrop-blur-lg rounded-xl p-4 border border-orange-500/30 hover:border-orange-400/50 transition-all duration-300 group text-center">
            <Settings className="w-8 h-8 text-orange-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white font-medium">Databases</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
