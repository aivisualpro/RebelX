'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'English' | 'Arabic';

interface Translations {
  [key: string]: {
    English: string;
    Arabic: string;
  };
}

const translations: Translations = {
  // Dashboard
  'dashboard.title': {
    English: 'Dashboard',
    Arabic: 'لوحة التحكم'
  },
  'dashboard.totalSales': {
    English: 'Total Sales',
    Arabic: 'إجمالي المبيعات'
  },
  'dashboard.uniqueClients': {
    English: 'Unique Clients',
    Arabic: 'العملاء الفريدون'
  },
  'dashboard.totalLocations': {
    English: 'Total Locations',
    Arabic: 'إجمالي المواقع'
  },
  'dashboard.channels': {
    English: 'Channels',
    Arabic: 'القنوات'
  },
  'dashboard.rebelxTypes': {
    English: 'RebelX Types',
    Arabic: 'أنواع RebelX'
  },
  'dashboard.totalPaid': {
    English: 'Total Paid',
    Arabic: 'إجمالي المدفوع'
  },
  'dashboard.totalDiscounts': {
    English: 'Total Discounts',
    Arabic: 'إجمالي الخصومات'
  },
  'dashboard.outstandingDue': {
    English: 'Outstanding Due',
    Arabic: 'المبالغ المستحقة'
  },
  'dashboard.artists': {
    English: 'Artists',
    Arabic: 'الفنانون'
  },
  'dashboard.avgManagerRating': {
    English: 'Avg. Manager Rating',
    Arabic: 'متوسط تقييم المدير'
  },
  'chart.salesTrends': {
    English: 'Sales Trends By Location',
    Arabic: 'اتجاهات المبيعات حسب الموقع'
  },
  'chart.6months': {
    English: '6 Months',
    Arabic: '6 أشهر'
  },
  'chart.3months': {
    English: '3 Months',
    Arabic: '3 أشهر'
  },
  'chart.30days': {
    English: '30 Days',
    Arabic: '30 يوم'
  },
  'chart.7days': {
    English: '7 Days',
    Arabic: '7 أيام'
  },
  'chart.24hours': {
    English: '24 Hours',
    Arabic: '24 ساعة'
  },
  // Menu items
  'menu.connections': {
    English: 'Connections',
    Arabic: 'الاتصالات'
  },

  'menu.account': {
    English: 'Account',
    Arabic: 'الحساب'
  },
  'menu.logout': {
    English: 'Logout',
    Arabic: 'تسجيل الخروج'
  },
  'menu.language': {
    English: 'Language',
    Arabic: 'اللغة'
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('English');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('selectedLanguage') as Language;
    if (savedLanguage && ['English', 'Arabic'].includes(savedLanguage)) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
    localStorage.setItem('selectedLanguage', newLanguage);
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  const isRTL = language === 'Arabic';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      <div dir={isRTL ? 'rtl' : 'ltr'} className={isRTL ? 'font-arabic' : ''}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
