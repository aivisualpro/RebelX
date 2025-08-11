'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'English' | 'Arabic' | 'Egyptian';

interface Translations {
  [key: string]: {
    English: string;
    Arabic: string;
    Egyptian: string;
  };
}

const translations: Translations = {
  // Dashboard
  'dashboard.title': {
    English: 'Dashboard',
    Arabic: 'لوحة التحكم',
    Egyptian: 'الداشبورد'
  },
  'dashboard.totalSales': {
    English: 'Total Sales',
    Arabic: 'إجمالي المبيعات',
    Egyptian: 'مجموع المبيعات'
  },
  'dashboard.uniqueClients': {
    English: 'Unique Clients',
    Arabic: 'العملاء الفريدون',
    Egyptian: 'العملاء المميزين'
  },
  'dashboard.totalLocations': {
    English: 'Total Locations',
    Arabic: 'إجمالي المواقع',
    Egyptian: 'مجموع الفروع'
  },
  'dashboard.channels': {
    English: 'Channels',
    Arabic: 'القنوات',
    Egyptian: 'القنوات'
  },
  'dashboard.bookingTypes': {
    English: 'Booking Types',
    Arabic: 'أنواع الحجز',
    Egyptian: 'أنواع البوكينج'
  },
  'dashboard.totalPaid': {
    English: 'Total Paid',
    Arabic: 'إجمالي المدفوع',
    Egyptian: 'مجموع المدفوع'
  },
  'dashboard.totalDiscounts': {
    English: 'Total Discounts',
    Arabic: 'إجمالي الخصومات',
    Egyptian: 'مجموع التخفيضات'
  },
  'dashboard.outstandingDue': {
    English: 'Outstanding Due',
    Arabic: 'المبالغ المستحقة',
    Egyptian: 'الفلوس المستحقة'
  },
  'dashboard.artists': {
    English: 'Artists',
    Arabic: 'الفنانون',
    Egyptian: 'الفنانين'
  },
  'dashboard.avgManagerRating': {
    English: 'Avg. Manager Rating',
    Arabic: 'متوسط تقييم المدير',
    Egyptian: 'متوسط تقييم المدير'
  },
  'chart.salesTrends': {
    English: 'Sales Trends By Location',
    Arabic: 'اتجاهات المبيعات حسب الموقع',
    Egyptian: 'ترند المبيعات حسب الفرع'
  },
  'chart.6months': {
    English: '6 Months',
    Arabic: '6 أشهر',
    Egyptian: '6 شهور'
  },
  'chart.3months': {
    English: '3 Months',
    Arabic: '3 أشهر',
    Egyptian: '3 شهور'
  },
  'chart.30days': {
    English: '30 Days',
    Arabic: '30 يوم',
    Egyptian: '30 يوم'
  },
  'chart.7days': {
    English: '7 Days',
    Arabic: '7 أيام',
    Egyptian: '7 أيام'
  },
  'chart.24hours': {
    English: '24 Hours',
    Arabic: '24 ساعة',
    Egyptian: '24 ساعة'
  },
  // Menu items
  'menu.connections': {
    English: 'Connections',
    Arabic: 'الاتصالات',
    Egyptian: 'الكونكشن'
  },

  'menu.account': {
    English: 'Account',
    Arabic: 'الحساب',
    Egyptian: 'الأكونت'
  },
  'menu.logout': {
    English: 'Logout',
    Arabic: 'تسجيل الخروج',
    Egyptian: 'خروج'
  },
  'menu.language': {
    English: 'Language',
    Arabic: 'اللغة',
    Egyptian: 'اللغة'
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
    if (savedLanguage && ['English', 'Arabic', 'Egyptian'].includes(savedLanguage)) {
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

  const isRTL = language === 'Arabic' || language === 'Egyptian';

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
