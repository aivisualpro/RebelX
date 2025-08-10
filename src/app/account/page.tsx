'use client';

import { useEffect, useState } from 'react';
import { companyService, CompanyData } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const companyId = searchParams.get('companyId') || (document.cookie.match(/(?:^|; )companyId=([^;]+)/)?.[1] ?? 'booking-plus');
    companyService.getCompanyData(companyId).then(data => {
      if (data) {
        setCompany(data);
        setName(data.companyName);
        setDescription(data.description);
      }
    }).catch(()=>{});
  }, [searchParams]);

  const onSave = async () => {
    try {
      setSaving(true); setError(''); setSaved(false);
      const companyId = searchParams.get('companyId') || (document.cookie.match(/(?:^|; )companyId=([^;]+)/)?.[1] ?? 'booking-plus');
      await companyService.updateCompany(companyId, { companyName: name, description, logoFile });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Account</h1>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
      {saved && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">Saved</div>}
      <div className="space-y-4 bg-white rounded-xl border border-slate-200 p-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Company Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Description</label>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" rows={3} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Logo</label>
          <input type="file" onChange={e=>setLogoFile(e.target.files?.[0] || null)} />
        </div>
        <div className="flex justify-end">
          <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-slate-900 text-white rounded-lg">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}


