'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiChevronDown } from 'react-icons/hi';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'What is Adventure Quest?',
    answer: 'Adventure Quest is an epic cartoon-style adventure game where you embark on thrilling quests, battle fierce enemies, and explore magical worlds with unique characters.',
  },
  {
    question: 'Is the game free to play?',
    answer: 'Yes! Adventure Quest is free to play with optional in-game purchases for cosmetic items and convenience features. All core gameplay content is accessible without spending money.',
  },
  {
    question: 'What platforms is the game available on?',
    answer: 'Adventure Quest is available on iOS, Android, and Web browsers. Cross-platform play is supported, so you can play with friends regardless of their device.',
  },
  {
    question: 'Can I play offline?',
    answer: 'While some single-player content can be played offline, an internet connection is required for multiplayer features, cloud saves, and accessing the latest content updates.',
  },
  {
    question: 'How do I unlock new characters?',
    answer: 'Characters can be unlocked through gameplay progression, completing special quests, participating in events, or purchasing them in the in-game store.',
  },
  {
    question: 'Is there multiplayer mode?',
    answer: 'Yes! Adventure Quest features co-op multiplayer where you can team up with friends to tackle challenging dungeons and epic boss battles together.',
  },
  {
    question: 'How often do you release updates?',
    answer: 'We release major content updates monthly, with smaller patches and bug fixes as needed. Follow our social media channels to stay updated on new features and events.',
  },
  {
    question: 'What are the system requirements?',
    answer: 'For mobile: iOS 12+ or Android 8+. For web: Any modern browser (Chrome, Firefox, Safari, Edge) with WebGL support. Minimum 2GB RAM recommended.',
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 min-h-screen">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent"></div>
      
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 mb-6">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Find answers to common questions about Adventure Quest
          </p>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="bg-black/40 backdrop-blur-sm border border-purple-500/20 rounded-xl overflow-hidden hover:border-purple-500/40 transition-all duration-300"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-purple-900/10 transition-colors duration-200"
              >
                <span className="text-lg font-semibold text-purple-300 pr-4">
                  {faq.question}
                </span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex-shrink-0"
                >
                  <HiChevronDown className="text-purple-400 text-2xl" />
                </motion.div>
              </button>
              
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5 text-gray-300 leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 text-center"
        >
          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-purple-300 mb-4">
              Still have questions?
            </h3>
            <p className="text-gray-300 mb-6">
              Can&apos;t find the answer you&apos;re looking for? Reach out to our support team.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-purple-500/50 hover:shadow-purple-500/80 transition-all duration-300"
            >
              Contact Support
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
