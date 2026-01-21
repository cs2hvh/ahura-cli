import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { GAME_INFO } from '@/lib/constants';
import type { Metadata } from 'next';
import { FaTicketAlt, FaClock, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';

export const metadata: Metadata = {
  title: `Support Tickets - ${GAME_INFO.title}`,
  description: `View and manage your support tickets for ${GAME_INFO.title}. Get help with game issues, account problems, and more.`,
};

export default function TicketsPage() {
  return (
    <main className="min-h-screen bg-black">
      <Navigation />
      
      <div className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Support Tickets
            </h1>
            <button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-full font-semibold hover:from-purple-700 hover:to-pink-700 transition-all duration-200 hover:scale-105">
              Create New Ticket
            </button>
          </div>

          <div className="grid gap-6 mb-12">
            <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6 hover:border-purple-500/40 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FaTicketAlt className="text-purple-400 text-xl" />
                    <h3 className="text-xl font-semibold text-white">Unable to Login to Account</h3>
                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-semibold rounded-full">
                      In Progress
                    </span>
                  </div>
                  <p className="text-gray-400 mb-4">
                    I'm having trouble logging into my account. The password reset email isn't arriving in my inbox.
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaClock />
                      <span>Opened 2 hours ago</span>
                    </div>
                    <span>•</span>
                    <span>Ticket #12345</span>
                    <span>•</span>
                    <span className="text-purple-400">Priority: High</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6 hover:border-purple-500/40 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FaTicketAlt className="text-green-400 text-xl" />
                    <h3 className="text-xl font-semibold text-white">Missing In-Game Purchase</h3>
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full flex items-center gap-1">
                      <FaCheckCircle className="text-xs" />
                      Resolved
                    </span>
                  </div>
                  <p className="text-gray-400 mb-4">
                    I purchased the Legendary Hero Pack but didn't receive the items in my inventory.
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaClock />
                      <span>Resolved 1 day ago</span>
                    </div>
                    <span>•</span>
                    <span>Ticket #12344</span>
                    <span>•</span>
                    <span className="text-green-400">Priority: Medium</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6 hover:border-purple-500/40 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FaTicketAlt className="text-red-400 text-xl" />
                    <h3 className="text-xl font-semibold text-white">Game Crashes on Startup</h3>
                    <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded-full flex items-center gap-1">
                      <FaExclamationCircle className="text-xs" />
                      Urgent
                    </span>
                  </div>
                  <p className="text-gray-400 mb-4">
                    The game crashes immediately after the loading screen on my Android device (Samsung Galaxy S21).
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaClock />
                      <span>Opened 5 hours ago</span>
                    </div>
                    <span>•</span>
                    <span>Ticket #12343</span>
                    <span>•</span>
                    <span className="text-red-400">Priority: Urgent</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-purple-500/20 rounded-lg p-6 hover:border-purple-500/40 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FaTicketAlt className="text-green-400 text-xl" />
                    <h3 className="text-xl font-semibold text-white">Character Stats Not Updating</h3>
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full flex items-center gap-1">
                      <FaCheckCircle className="text-xs" />
                      Resolved
                    </span>
                  </div>
                  <p className="text-gray-400 mb-4">
                    After upgrading my character Luna Starlight, her stats aren't reflecting the upgrade in battles.
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaClock />
                      <span>Resolved 3 days ago</span>
                    </div>
                    <span>•</span>
                    <span>Ticket #12342</span>
                    <span>•</span>
                    <span className="text-blue-400">Priority: Low</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-lg p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Need Help?</h2>
            <p className="text-gray-300 mb-6">
              Our support team is here to help you with any issues you're experiencing. Create a new ticket and we'll get back to you as soon as possible.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-black/40 p-4 rounded-lg">
                <h3 className="text-purple-400 font-semibold mb-2">Average Response Time</h3>
                <p className="text-2xl font-bold text-white">2-4 hours</p>
              </div>
              <div className="bg-black/40 p-4 rounded-lg">
                <h3 className="text-purple-400 font-semibold mb-2">Resolution Rate</h3>
                <p className="text-2xl font-bold text-white">98%</p>
              </div>
              <div className="bg-black/40 p-4 rounded-lg">
                <h3 className="text-purple-400 font-semibold mb-2">Support Hours</h3>
                <p className="text-2xl font-bold text-white">24/7</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
