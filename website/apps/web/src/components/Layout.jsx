import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Toaster } from '@/components/ui/toaster';
import CustomCursor from '@/components/CustomCursor';
import { WebsiteContentProvider } from '@/context/WebsiteContentContext';

const Layout = () => {
  return (
    <WebsiteContentProvider>
      <CustomCursor />
      <div className="min-h-screen bg-[#0C0D0D] text-white overflow-x-hidden flex flex-col">
        <Header />
        <main className="flex-grow">
          <Outlet />
        </main>
        <Footer />
        <Toaster />
      </div>
    </WebsiteContentProvider>
  );
};

export default Layout;