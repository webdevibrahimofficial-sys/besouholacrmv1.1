import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import SuperAdminSidebar from '../shared/components/SuperAdminSidebar';
import SuperAdminTopbar from '../shared/components/SuperAdminTopbar';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@shared/context/ThemeProvider';

export default function SuperAdminLayout() {
  const { i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isRTL = i18n.language === 'ar';
  
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Force direction based on language
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.body.dir = isRTL ? 'rtl' : 'ltr';
  }, [isRTL]);

  // Handle auto-collapse on mobile/tablet
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-[#020617] text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Sidebar */}
      <SuperAdminSidebar 
        isOpen={isMobileSidebarOpen} 
        onClose={() => setIsMobileSidebarOpen(false)} 
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out
          ${isRTL 
            ? (collapsed ? 'md:mr-[88px] mr-0' : 'md:mr-[280px] mr-0') 
            : (collapsed ? 'md:ml-[88px] ml-0' : 'md:ml-[280px] ml-0')
          }
      `}>
        <div className={`flex-1 scroll-smooth ${
          isDark
            ? 'bg-[linear-gradient(180deg,#020617_0%,#0f172a_100%)]'
            : 'bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]'
        }`}>
          {/* Topbar */}
          <SuperAdminTopbar 
            onMobileToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} 
            mobileSidebarOpen={isMobileSidebarOpen}
          />

          {/* Page Content */}
          <main className="relative z-0 px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
