import { FaTwitter, FaDiscord, FaInstagram, FaFacebook, FaYoutube, FaReddit } from 'react-icons/fa';
import { GAME_INFO, SOCIAL_LINKS, FOOTER_LINKS, NAVIGATION_LINKS } from '@/lib/constants';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FaTwitter,
  FaDiscord,
  FaInstagram,
  FaFacebook,
  FaYoutube,
  FaReddit
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const handleNavClick = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
              {GAME_INFO.title}
            </h3>
            <p className="text-gray-400 leading-relaxed">
              {GAME_INFO.tagline}
            </p>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">About</h4>
            <nav>
              <ul className="space-y-2">
                {FOOTER_LINKS.about.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.href}
                      className="text-gray-400 hover:text-purple-400 transition-colors duration-200"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Support</h4>
            <nav>
              <ul className="space-y-2">
                {FOOTER_LINKS.support.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.href}
                      className="text-gray-400 hover:text-purple-400 transition-colors duration-200"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <nav>
              <ul className="space-y-2">
                {NAVIGATION_LINKS.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.href}
                      onClick={(e) => {
                        e.preventDefault();
                        handleNavClick(link.href);
                      }}
                      className="text-gray-400 hover:text-purple-400 transition-colors duration-200 cursor-pointer"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-6">
              {SOCIAL_LINKS.map((social, index) => {
                const IconComponent = iconMap[social.iconName];
                return (
                  <a
                    key={index}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-purple-400 transition-all duration-200 hover:scale-110"
                    aria-label={social.name}
                  >
                    {IconComponent && <IconComponent className="text-2xl" />}
                  </a>
                );
              })}
            </div>

            <div className="text-center md:text-right">
              <p className="text-gray-400 text-sm">
                © {currentYear} {GAME_INFO.title}. All rights reserved.
              </p>
              <div className="flex flex-wrap justify-center md:justify-end gap-4 mt-2">
                {FOOTER_LINKS.legal.map((link, index) => (
                  <a
                    key={index}
                    href={link.href}
                    className="text-gray-500 hover:text-purple-400 text-xs transition-colors duration-200"
                  >
                    {link.name}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
