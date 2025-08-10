'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Building, Upload, FileText, Menu, X } from 'lucide-react';
import { companyService } from '@/lib/auth';

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false); // Always false - sign-in only
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    companyName: '',
    description: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    // Signin fields
    email: '',
    password: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'file') {
      const fileInput = e.target as HTMLInputElement;
      setLogoFile(fileInput.files?.[0] || null);
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Validate required fields for company creation
        if (!formData.companyName || !logoFile || !formData.description || 
            !formData.adminName || !formData.adminEmail || !formData.adminPassword) {
          throw new Error('All fields are required for company creation');
        }

        // Create company
        const { companyId } = await companyService.createCompany({
          companyName: formData.companyName,
          description: formData.description,
          logo: logoFile,
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
        });
        
        // Store in cookie (simple session) and redirect
        document.cookie = `companyId=${companyId}; path=/; max-age=${60*60*24*7}`;
        router.push(`/dashboard?companyId=${companyId}`);
      } else {
        // Sign in - validate email and password
        if (!formData.email || !formData.password) {
          throw new Error('Email and password are required');
        }

        try {
          // Authenticate against either 'saudi1' or 'egypt1' user_manager records by email/password
          const authResult = await companyService.signIn({
            email: formData.email,
            password: formData.password,
          });
          
          // Store in cookie
          document.cookie = `companyId=${authResult.companyId}; path=/; max-age=${60*60*24*7}`;
          // Persist allowedRegions and set initial region
          localStorage.setItem('allowedRegions', JSON.stringify(authResult.allowedRegions));
          // IMPORTANT: Always use first allowed region as initial
          localStorage.setItem('region', authResult.allowedRegions[0]);
          // Store user email for access control
          localStorage.setItem('userEmail', formData.email);
          
          // Trigger storage event to immediately update AppStateProvider
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'allowedRegions',
            newValue: JSON.stringify(authResult.allowedRegions),
            oldValue: null,
            storageArea: localStorage
          }));
          
          // Navigate only after success
          router.push(`/dashboard?companyId=${authResult.companyId}`);
        } catch (e: any) {
          // Handle authentication errors gracefully
          if (e.message === 'Invalid password') {
            setError('Incorrect password. Please try again.');
          } else if (e.message === 'Email not found in any region') {
            setError('Email not found. Please check your email address.');
          } else {
            setError(e.message || 'Invalid email or password');
          }
          return; // Don't rethrow - we want to stay on auth page
        }
      }
    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message || 'Operation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50">

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            {isSignUp ? 'Create your company account' : 'Welcome back'}
          </h1>
          <p className="text-slate-600">
            {isSignUp ? 'Set up your company in our database' : 'Sign in to access your dashboard'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8">


          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-slate-800">
              {isSignUp ? 'Company Registration' : 'Sign In'}
            </h2>
            <p className="text-slate-600 text-sm mt-1">
              {isSignUp ? 'Set up your company in our database' : 'Access your dashboard'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp ? (
              <>
                {/* Company Name */}
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    name="companyName"
                    placeholder="Company Name"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900"
                    required
                  />
                </div>

                {/* Logo Upload */}
                <div className="relative">
                  <Upload className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="file"
                    name="logo"
                    accept="image/*"
                    onChange={handleInputChange}
                    key={isSignUp ? 'signup-logo' : 'signin-logo'}
                    className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-slate-900 file:mr-4 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    required
                  />
                </div>

                {/* Description */}
                <div className="relative">
                  <FileText className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                  <textarea
                    name="description"
                    placeholder="Company Description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900 resize-none"
                    required
                  />
                </div>

                {/* Admin Name */}
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    name="adminName"
                    placeholder="Admin Name"
                    value={formData.adminName}
                    onChange={handleInputChange}
                    className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900"
                    required
                  />
                </div>

                {/* Admin Email */}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="email"
                    name="adminEmail"
                    placeholder="Admin Email"
                    value={formData.adminEmail}
                    onChange={handleInputChange}
                    className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900"
                    required
                  />
                </div>

                {/* Admin Password */}
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="adminPassword"
                    placeholder="Admin Password"
                    value={formData.adminPassword}
                    onChange={handleInputChange}
                    className="w-full pl-12 pr-12 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Sign In Fields */}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email Address"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900"
                    required
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full pl-12 pr-12 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder:text-slate-400 text-slate-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </>
            )}



            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{isSignUp ? 'Creating Company...' : 'Signing in...'}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>{isSignUp ? 'Create Company' : 'Sign In'}</span>
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </button>
          </form>


        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-sm">
          <p>© 2025 BookingX. All rights reserved.</p>
        </div>
      </div>
    </div>
    </div>
  );
}
