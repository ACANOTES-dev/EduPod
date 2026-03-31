import type { Meta, StoryObj } from '@storybook/react';

import { SkeletonCascade } from './skeleton-cascade';

const meta: Meta<typeof SkeletonCascade> = {
  title: 'Components/SkeletonCascade',
  component: SkeletonCascade,
  tags: ['autodocs'],
  argTypes: {
    count: { control: { type: 'range', min: 1, max: 10 } },
    delay: { control: { type: 'range', min: 0, max: 200 } },
  },
};

export default meta;
type Story = StoryObj<typeof SkeletonCascade>;

export const Default: Story = {
  args: {
    count: 5,
  },
};

export const Short: Story = {
  args: {
    count: 3,
  },
};

export const Long: Story = {
  args: {
    count: 8,
  },
};

export const FastDelay: Story = {
  args: {
    count: 5,
    delay: 20,
  },
};

export const SlowDelay: Story = {
  args: {
    count: 5,
    delay: 150,
  },
};

export const CompactRows: Story = {
  args: {
    count: 6,
    itemClassName: 'h-8',
  },
};

export const TallRows: Story = {
  args: {
    count: 4,
    itemClassName: 'h-16',
  },
};
