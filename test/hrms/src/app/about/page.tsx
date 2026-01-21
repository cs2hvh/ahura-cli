import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { GAME_INFO } from '@/lib/constants';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `About Us - ${GAME_INFO.title}`,
  description: `Learn more about ${GAME_INFO.title} and our mission to create the best adventure gaming experience.`,
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black">
      <Navigation />
      
      <div className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-8">
            About {GAME_INFO.title}
          </h1>

          <div className="space-y-8 text-gray-300">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Our Story</h2>
              <p className="leading-relaxed">
                {GAME_INFO.title} was born from a passion for creating immersive gaming experiences that bring people together. 
                Since our launch, we've grown into a vibrant community of millions of players worldwide, all united by their love 
                for adventure and exploration.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Our Mission</h2>
              <p className="leading-relaxed">
                We believe that games should be more than just entertainment—they should be experiences that inspire, challenge, 
                and connect people. Our mission is to create a world where players can embark on epic journeys, forge lasting 
                friendships, and discover the hero within themselves.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">What We Offer</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>Over 100 unique characters with diverse abilities and playstyles</li>
                <li>Regular content updates with new storylines and events</li>
                <li>Cross-platform gameplay across mobile, tablet, and desktop</li>
                <li>Competitive PvP modes and cooperative multiplayer experiences</li>
                <li>A dedicated community and responsive support team</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Our Values</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-900 p-6 rounded-lg border border-purple-500/20">
                  <h3 className="text-xl font-semibold text-purple-400 mb-2">Player First</h3>
                  <p className="text-sm">
                    Every decision we make is guided by what's best for our players and community.
                  </p>
                </div>
                <div className="bg-gray-900 p-6 rounded-lg border border-purple-500/20">
                  <h3 className="text-xl font-semibold text-purple-400 mb-2">Innovation</h3>
                  <p className="text-sm">
                    We constantly push boundaries to deliver fresh, exciting gaming experiences.
                  </p>
                </div>
                <div className="bg-gray-900 p-6 rounded-lg border border-purple-500/20">
                  <h3 className="text-xl font-semibold text-purple-400 mb-2">Integrity</h3>
                  <p className="text-sm">
                    We're committed to fair play, transparency, and ethical game design.
                  </p>
                </div>
                <div className="bg-gray-900 p-6 rounded-lg border border-purple-500/20">
                  <h3 className="text-xl font-semibold text-purple-400 mb-2">Community</h3>
                  <p className="text-sm">
                    We foster a welcoming, inclusive environment where everyone can thrive.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Join Our Journey</h2>
              <p className="leading-relaxed">
                Whether you're a seasoned adventurer or just starting your quest, there's a place for you in {GAME_INFO.title}. 
                Join millions of players and discover why our game has become one of the most beloved adventure experiences in the world.
              </p>
              <div className="mt-6">
                <a
                  href="/"
                  className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-full font-semibold hover:from-purple-700 hover:to-pink-700 transition-all duration-200 hover:scale-105"
                >
                  Start Playing Now
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
