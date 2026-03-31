import type { Meta, StoryObj } from '@storybook/react';
import { BookOpen, Search, Users } from 'lucide-react';

import { EmptyState } from './empty-state';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    icon: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: 'No students found',
    description: 'There are no students enrolled yet. Add a student to get started.',
  },
};

export const WithIcon: Story = {
  args: {
    icon: Users,
    title: 'No students found',
    description: 'There are no students enrolled yet. Add a student to get started.',
  },
};

export const WithAction: Story = {
  args: {
    icon: Users,
    title: 'No students enrolled',
    description: 'Enrol your first student to begin managing attendance, grades, and fees.',
    action: {
      label: 'Enrol Student',
      onClick: () => undefined,
    },
  },
};

export const SearchEmpty: Story = {
  args: {
    icon: Search,
    title: 'No results for "Ahmed"',
    description: 'Try a different name, ID, or check your spelling.',
  },
};

export const NoDescription: Story = {
  args: {
    icon: BookOpen,
    title: 'No classes scheduled',
  },
};

export const NoIcon: Story = {
  args: {
    title: 'Nothing here yet',
    description: 'Come back later or contact your administrator.',
    action: {
      label: 'Refresh',
      onClick: () => undefined,
    },
  },
};
