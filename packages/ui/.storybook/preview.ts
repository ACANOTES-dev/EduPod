import type { Preview } from '@storybook/react';

import '../src/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#FEFDFB' },
        { name: 'dark', value: '#0C0A09' },
      ],
    },
  },
};

export default preview;
