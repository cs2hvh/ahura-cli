'use client';

import { motion } from 'framer-motion';
import { HiChevronDown } from 'react-icons/hi';
import { GAME_INFO, CTA_BUTTONS } from '@/lib/constants';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3
    }
  }
};

const fadeInUpVariants = {
  hidden: {
    opacity: 0,
    y: 60
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.6, -0.05, 0.01, 0.99]
    }
  }
};

const scrollIndicatorVariants = {
  animate: {
    y: [0, 10, 0],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

export default function Hero() {
  const handleScrollToFeatures = () => {
    const featuresSection = document.querySelector('#features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400"
    >
      <div className="absolute inset-0 bg-black/20"></div>
      
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-purple-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-pink-500/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-20 pb-16"
      >
        <motion.h1
          variants={fadeInUpVariants}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold text-white mb-6 leading-tight"
        >
          {GAME_INFO.title}
        </motion.h1>

        <motion.p
          variants={fadeInUpVariants}
          className="text-xl sm:text-2xl md:text-3xl text-white/90 font-semibold mb-4 max-w-3xl mx-auto"
        >
          {GAME_INFO.tagline}
        </motion.p>

        <motion.p
          variants={fadeInUpVariants}
          className="text-base sm:text-lg md:text-xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          {GAME_INFO.description}
        </motion.p>

        <motion.div
          variants={fadeInUpVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-white text-purple-600 px-8 py-4 rounded-full font-bold text-lg shadow-2xl hover:shadow-white/50 transition-shadow duration-300 w-full sm:w-auto"
          >
            {CTA_BUTTONS.primary}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white hover:text-purple-600 transition-all duration-300 w-full sm:w-auto"
          >
            {CTA_BUTTONS.secondary}
          </motion.button>
        </motion.div>
      </motion.div>

      <motion.div
        variants={scrollIndicatorVariants}
        animate="animate"
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 cursor-pointer z-10"
        onClick={handleScrollToFeatures}
      >
        <div className="flex flex-col items-center">
          <span className="text-white/80 text-sm font-medium mb-2">Scroll to explore</span>
          <HiChevronDown className="text-white text-3xl" />
        </div>
      </motion.div>
    </section>
  );
}
