import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import ScrollToTop from '@/components/ScrollToTop';
import FAQSection from '@/components/FAQSection';

export const metadata = {
  title: 'Help - Adventure Quest',
  description: 'Get help and find answers to your questions about Adventure Quest game',
};

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <Navigation />
      <FAQSection />
      <Footer />
      <ScrollToTop />
    </main>
  );
}
