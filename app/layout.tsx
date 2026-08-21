import './globals.css'
import type { Metadata } from 'next'
import CookieBanner from '@/components/CookieBanner'

export const metadata: Metadata = {
  title: 'Overweel 3D Print Services',
  description: 'High quality 3D printing services',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nl">
      <head />
      <body className="font-sans bg-gray-50">
        {children}
        <CookieBanner />
      </body>
    </html>
  )
}