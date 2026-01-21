import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { GAME_INFO } from '@/lib/constants';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Privacy Policy - ${GAME_INFO.title}`,
  description: `Privacy Policy for ${GAME_INFO.title}. Learn how we collect, use, and protect your personal information.`,
};

export default function PrivacyPage() {
  const lastUpdated = "January 18, 2026";

  return (
    <main className="min-h-screen bg-black">
      <Navigation />
      
      <div className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
            Privacy Policy
          </h1>
          <p className="text-gray-400 mb-8">Last Updated: {lastUpdated}</p>

          <div className="space-y-8 text-gray-300">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Introduction</h2>
              <p className="leading-relaxed">
                Welcome to {GAME_INFO.title}. We respect your privacy and are committed to protecting your personal data. 
                This privacy policy will inform you about how we look after your personal data when you visit our website 
                or use our game, and tell you about your privacy rights and how the law protects you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Information We Collect</h2>
              <p className="leading-relaxed mb-4">We may collect, use, store and transfer different kinds of personal data about you:</p>
              <ul className="space-y-2 list-disc list-inside">
                <li><strong className="text-white">Identity Data:</strong> Username, display name, and profile information</li>
                <li><strong className="text-white">Contact Data:</strong> Email address and communication preferences</li>
                <li><strong className="text-white">Technical Data:</strong> IP address, browser type, device information, and gameplay data</li>
                <li><strong className="text-white">Usage Data:</strong> Information about how you use our game and services</li>
                <li><strong className="text-white">Marketing Data:</strong> Your preferences in receiving marketing from us</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">How We Use Your Information</h2>
              <p className="leading-relaxed mb-4">We use your personal data for the following purposes:</p>
              <ul className="space-y-2 list-disc list-inside">
                <li>To provide and maintain our game services</li>
                <li>To manage your account and provide customer support</li>
                <li>To improve and personalize your gaming experience</li>
                <li>To communicate with you about updates, events, and promotions</li>
                <li>To detect and prevent fraud and abuse</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Data Security</h2>
              <p className="leading-relaxed">
                We have implemented appropriate security measures to prevent your personal data from being accidentally lost, 
                used, or accessed in an unauthorized way. We limit access to your personal data to those employees, agents, 
                contractors, and other third parties who have a business need to know.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Data Retention</h2>
              <p className="leading-relaxed">
                We will only retain your personal data for as long as necessary to fulfill the purposes we collected it for, 
                including for the purposes of satisfying any legal, accounting, or reporting requirements. When we no longer 
                need your data, we will securely delete or anonymize it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Your Rights</h2>
              <p className="leading-relaxed mb-4">Under certain circumstances, you have rights under data protection laws in relation to your personal data:</p>
              <ul className="space-y-2 list-disc list-inside">
                <li>Request access to your personal data</li>
                <li>Request correction of your personal data</li>
                <li>Request erasure of your personal data</li>
                <li>Object to processing of your personal data</li>
                <li>Request restriction of processing your personal data</li>
                <li>Request transfer of your personal data</li>
                <li>Right to withdraw consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Cookies</h2>
              <p className="leading-relaxed">
                We use cookies and similar tracking technologies to track activity on our service and hold certain information. 
                Cookies are files with small amount of data which may include an anonymous unique identifier. You can instruct 
                your browser to refuse all cookies or to indicate when a cookie is being sent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Third-Party Services</h2>
              <p className="leading-relaxed">
                We may employ third-party companies and individuals to facilitate our service, provide the service on our behalf, 
                perform service-related services, or assist us in analyzing how our service is used. These third parties have 
                access to your personal data only to perform these tasks on our behalf and are obligated not to disclose or use 
                it for any other purpose.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Children's Privacy</h2>
              <p className="leading-relaxed">
                Our service is not directed to children under the age of 13. We do not knowingly collect personally identifiable 
                information from children under 13. If you are a parent or guardian and you are aware that your child has provided 
                us with personal data, please contact us.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Changes to This Privacy Policy</h2>
              <p className="leading-relaxed">
                We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy 
                Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically 
                for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Contact Us</h2>
              <p className="leading-relaxed">
                If you have any questions about this Privacy Policy, please contact us:
              </p>
              <div className="mt-4 bg-gray-900 p-6 rounded-lg border border-purple-500/20">
                <p className="text-white">Email: privacy@adventurequest.com</p>
                <p className="text-white mt-2">Address: 123 Gaming Street, San Francisco, CA 94102</p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
