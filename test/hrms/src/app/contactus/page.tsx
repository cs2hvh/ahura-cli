import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { GAME_INFO } from '@/lib/constants';
import type { Metadata } from 'next';
import { FaEnvelope, FaDiscord, FaTwitter, FaMapMarkerAlt, FaClock } from 'react-icons/fa';

export const metadata: Metadata = {
  title: `Contact Us - ${GAME_INFO.title}`,
  description: `Get in touch with the ${GAME_INFO.title} team. We're here to help with any questions or feedback.`,
};

export default function ContactUsPage() {
  return (
    <main className="min-h-screen bg-black">
      <Navigation />
      
      <div className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
            Contact Us
          </h1>
          <p className="text-gray-400 text-lg mb-12">
            Have a question or feedback? We'd love to hear from you! Choose the best way to reach us below.
          </p>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-8">
              <h2 className="text-2xl font-semibold text-white mb-6">Send us a Message</h2>
              <form className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    className="w-full px-4 py-3 bg-black border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="w-full px-4 py-3 bg-black border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    id="subject"
                    className="w-full px-4 py-3 bg-black border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="How can we help?"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={6}
                    className="w-full px-4 py-3 bg-black border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                    placeholder="Tell us what's on your mind..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-semibold hover:from-purple-700 hover:to-pink-700 transition-all duration-200 hover:scale-105"
                >
                  Send Message
                </button>
              </form>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-500/20 p-3 rounded-lg">
                    <FaEnvelope className="text-purple-400 text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">Email Support</h3>
                    <p className="text-gray-400 mb-2">
                      For general inquiries and support questions
                    </p>
                    <a href="mailto:support@adventurequest.com" className="text-purple-400 hover:text-purple-300 transition-colors">
                      support@adventurequest.com
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-500/20 p-3 rounded-lg">
                    <FaDiscord className="text-purple-400 text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">Discord Community</h3>
                    <p className="text-gray-400 mb-2">
                      Join our active community for instant help
                    </p>
                    <a href="https://discord.gg/adventurequest" className="text-purple-400 hover:text-purple-300 transition-colors">
                      discord.gg/adventurequest
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-500/20 p-3 rounded-lg">
                    <FaTwitter className="text-purple-400 text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">Social Media</h3>
                    <p className="text-gray-400 mb-2">
                      Follow us for updates and quick responses
                    </p>
                    <a href="https://twitter.com/adventurequest" className="text-purple-400 hover:text-purple-300 transition-colors">
                      @adventurequest
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-500/20 p-3 rounded-lg">
                    <FaMapMarkerAlt className="text-purple-400 text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">Office Location</h3>
                    <p className="text-gray-400">
                      123 Gaming Street<br />
                      San Francisco, CA 94102<br />
                      United States
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-500/20 p-3 rounded-lg">
                    <FaClock className="text-purple-400 text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">Business Hours</h3>
                    <p className="text-gray-400">
                      Monday - Friday: 9:00 AM - 6:00 PM PST<br />
                      Saturday - Sunday: 10:00 AM - 4:00 PM PST<br />
                      <span className="text-purple-400">24/7 Support Available</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-lg p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Frequently Asked Questions</h2>
            <p className="text-gray-300 mb-4">
              Before reaching out, you might find your answer in our FAQ section. We've compiled answers to the most common questions.
            </p>
            <a
              href="/help"
              className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-full font-semibold hover:from-purple-700 hover:to-pink-700 transition-all duration-200 hover:scale-105"
            >
              Visit FAQ
            </a>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
