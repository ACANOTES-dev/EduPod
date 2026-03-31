import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import { TipTapEditor } from './tiptap-editor';

const meta: Meta<typeof TipTapEditor> = {
  title: 'Components/TipTapEditor',
  component: TipTapEditor,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof TipTapEditor>;

export const Empty: Story = {
  render: (args) => {
    const [value, setValue] = React.useState('');
    return <TipTapEditor {...args} value={value} onChange={setValue} />;
  },
  args: {
    placeholder: 'Write your content here… (HTML supported)',
    disabled: false,
  },
};

export const WithContent: Story = {
  render: (args) => {
    const [value, setValue] = React.useState(
      '<h2>Term Report — Ahmed Al-Rashid</h2>\n<p>Ahmed has shown <b>excellent progress</b> this term. His attendance has been <i>consistent</i> and he actively participates in class discussions.</p>\n<ul>\n<li>Mathematics: A</li>\n<li>English: B+</li>\n<li>Science: A-</li>\n</ul>',
    );
    return <TipTapEditor {...args} value={value} onChange={setValue} />;
  },
  args: {
    placeholder: 'Write your content here…',
    disabled: false,
  },
};

export const Disabled: Story = {
  render: (args) => {
    const [value, setValue] = React.useState(
      '<p>This content is read-only and cannot be edited.</p>',
    );
    return <TipTapEditor {...args} value={value} onChange={setValue} />;
  },
  args: {
    disabled: true,
  },
};

export const WithCustomPlaceholder: Story = {
  render: (args) => {
    const [value, setValue] = React.useState('');
    return <TipTapEditor {...args} value={value} onChange={setValue} />;
  },
  args: {
    placeholder: "Write a note for this student's file\u2026",
    disabled: false,
  },
};
