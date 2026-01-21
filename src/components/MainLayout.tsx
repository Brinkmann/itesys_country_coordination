'use client';

import Sidebar from './Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>

      <style jsx>{`
        .app-layout {
          display: flex;
          min-height: 100vh;
          background: #f9fafb;
        }

        .main-content {
          flex: 1;
          margin-left: 260px;
          padding: 32px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
