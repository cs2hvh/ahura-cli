import Navigation from '@/components/Navigation';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Gallery from '@/components/Gallery';
import Characters from '@/components/Characters';
import Newsletter from '@/components/Newsletter';
import Footer from '@/components/Footer';
import ScrollToTop from '@/components/ScrollToTop';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navigation />
      <Hero />
      <Features />
      <Gallery />
      <Characters />
      <Newsletter />
      <Footer />
      <ScrollToTop />
    </main>
  );
}
