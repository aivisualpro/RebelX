// Company creation service using Firebase (no authentication)
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export interface CompanyData {
  companyName: string;
  description: string;
  logoUrl?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string; // Added password field
  createdAt: Date;
  updatedAt: Date;
}

export interface SignUpData {
  companyName: string;
  description: string;
  logo: File;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AuthResult {
  companyId: string;
  companyData: CompanyData;
  allowedRegions: Array<'saudi1' | 'egypt1'>;
}

class CompanyService {
  // Create company without authentication
  async createCompany(data: SignUpData): Promise<{ companyId: string }> {
    try {
      // Use company name as document ID (cleaned up for Firestore)
      const companyId = data.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

      // Upload company logo
      let logoUrl = '';
      if (data.logo) {
        try {
          logoUrl = await this.uploadCompanyLogo(data.logo, companyId);
        } catch (uploadError) {
          console.error('Logo upload failed, continuing without logo:', uploadError);
          // Continue with company creation even if logo upload fails
          logoUrl = '';
        }
      }

      // Create company document in 'clients' collection
      const companyData: CompanyData = {
        companyName: data.companyName,
        description: data.description,
        logoUrl,
        adminName: data.adminName,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword, // Store password (in production, this should be hashed)
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(doc(db, 'clients', companyId), companyData);

      return { companyId };
    } catch (error) {
      console.error('Error during company creation:', error);
      throw error;
    }
  }

  // Update company profile
  async updateCompany(companyId: string, data: Partial<CompanyData> & { logoFile?: File | null }): Promise<void> {
    try {
      let logoUrl: string | undefined;
      if (data.logoFile) {
        try {
          logoUrl = await this.uploadCompanyLogo(data.logoFile, companyId);
        } catch (e) {
          console.error('Logo upload failed:', e);
        }
      }
      const docRef = doc(db, 'clients', companyId);
      const current = (await getDoc(docRef)).data() as CompanyData | undefined;
      const updated: any = {
        ...current,
        ...data,
        logoUrl: logoUrl ?? data.logoUrl ?? current?.logoUrl ?? '',
        updatedAt: new Date(),
      };
      delete updated.logoFile;
      await setDoc(docRef, updated, { merge: true });
    } catch (error) {
      console.error('Error updating company:', error);
      throw error;
    }
  }
  // Upload company logo to Firebase Storage (without authentication)
  async uploadCompanyLogo(file: File, companyId: string): Promise<string> {
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `company-logos/${companyId}/logo.${fileExtension}`;
      const storageRef = ref(storage, fileName);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
    } catch (error) {
      console.error('Error uploading logo:', error);
      // Re-throw the error with more context
      throw new Error(`Failed to upload company logo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Sign in by checking the user_manager records under either saudi1 or egypt1
  async signIn(credentials: SignInData): Promise<AuthResult> {
    try {
      const clientId = 'booking-plus';
      const connections = ['saudi1', 'egypt1'];
      const allowedRegions: Array<'saudi1' | 'egypt1'> = [];
      
      // STEP 1: First, determine ALL regions where this email exists
      for (const connectionId of connections) {
        const usersRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', 'user_manager', 'records');
        // Try exact field queries first
        const q1 = query(usersRef, where('email', '==', credentials.email));
        const q2 = query(usersRef, where('Email', '==', credentials.email));
        const snaps = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        if (snaps.some(s => !s.empty)) {
          allowedRegions.push(connectionId as 'saudi1' | 'egypt1');
        } else {
          // Fallback: scan a small batch to handle case/space differences
          const scan = await getDocs(usersRef);
          const norm = (v: any) => String(v ?? '').trim().toLowerCase();
          const found = scan.docs.some(d => {
            const data: any = d.data();
            return norm(data.email) === norm(credentials.email) || norm(data.Email) === norm(credentials.email);
          });
          
          if (found) {
            allowedRegions.push(connectionId as 'saudi1' | 'egypt1');
          }
        }
      }

      // If no regions found, throw error immediately
      if (allowedRegions.length === 0) {
        throw new Error('Email not found in any region');
      }

      // STEP 2: Now validate password in any of the allowed regions
      for (const connectionId of allowedRegions) {
        const usersRef = collection(db, 'clients', clientId, 'connections', connectionId, 'sheetTabs', 'user_manager', 'records');
        // Try queries first
        const q1 = query(usersRef, where('email', '==', credentials.email));
        const q2 = query(usersRef, where('Email', '==', credentials.email));
        const snaps = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        const checkDocs = async (docs: any[]) => {
          for (const d of docs) {
            const data: any = d.data();
            const pass = String(data.password ?? data.Password ?? '').trim();
            if (pass === String(credentials.password).trim()) {
              const companyDoc = await getDoc(doc(db, 'clients', clientId));
              return {
                companyId: clientId,
                companyData: (companyDoc.data() as CompanyData),
                allowedRegions: allowedRegions, // Use the complete list of allowed regions
              } as AuthResult;
            }
          }
          return null;
        };
        
        const res1 = await checkDocs(snaps[0]?.docs || []);
        if (res1) return res1;
        const res2 = await checkDocs(snaps[1]?.docs || []);
        if (res2) return res2;
        
        // Fallback scan to handle field name variations
        const scan = await getDocs(usersRef);
        const norm = (v: any) => String(v ?? '').trim().toLowerCase();
        for (const d of scan.docs) {
          const data: any = d.data();
          const emailMatch = norm(data.email) === norm(credentials.email) || norm(data.Email) === norm(credentials.email);
          const pass = String(data.password ?? data.Password ?? '').trim();
          if (emailMatch && pass === String(credentials.password).trim()) {
            const companyDoc = await getDoc(doc(db, 'clients', clientId));
            return {
              companyId: clientId,
              companyData: (companyDoc.data() as CompanyData),
              allowedRegions: allowedRegions, // Use the complete list of allowed regions
            } as AuthResult;
          }
        }
      }
      
      throw new Error('Invalid password');
    } catch (error) {
      // Only log unexpected errors, not authentication failures
      if (error instanceof Error && (
        error.message === 'Invalid password' || 
        error.message === 'Email not found in any region'
      )) {
        // These are expected authentication failures, don't log them
        throw error;
      } else {
        // Log unexpected errors
        console.error('Error during signin:', error);
        throw error;
      }
    }
  }

  // Get company data from Firestore
  async getCompanyData(companyId: string): Promise<CompanyData | null> {
    try {
      const companyDoc = await getDoc(doc(db, 'clients', companyId));
      if (companyDoc.exists()) {
        return companyDoc.data() as CompanyData;
      }
      return null;
    } catch (error) {
      console.error('Error getting company data:', error);
      throw error;
    }
  }
}

export const companyService = new CompanyService();
export default companyService;
