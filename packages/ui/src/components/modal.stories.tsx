import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import { Modal } from './modal';

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
    },
    open: { control: 'boolean' },
    isLoading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: (args) => {
    const [open, setOpen] = React.useState(true);
    return (
      <div>
        <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Open Modal
        </button>
        <Modal {...args} open={open} onOpenChange={setOpen} />
      </div>
    );
  },
  args: {
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed? This action cannot be undone.',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    onConfirm: () => undefined,
    variant: 'default',
    isLoading: false,
  },
};

export const Destructive: Story = {
  render: (args) => {
    const [open, setOpen] = React.useState(true);
    return (
      <div>
        <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Open Modal
        </button>
        <Modal {...args} open={open} onOpenChange={setOpen} />
      </div>
    );
  },
  args: {
    title: 'Delete Student Record',
    description:
      'This will permanently delete the student record and all associated data. This action cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    onConfirm: () => undefined,
    variant: 'destructive',
    isLoading: false,
  },
};

export const WithLoading: Story = {
  render: (args) => {
    const [open, setOpen] = React.useState(true);
    return (
      <div>
        <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Open Modal
        </button>
        <Modal {...args} open={open} onOpenChange={setOpen} />
      </div>
    );
  },
  args: {
    title: 'Saving Changes',
    description: 'Please wait while your changes are being saved.',
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    onConfirm: () => undefined,
    variant: 'default',
    isLoading: true,
  },
};

export const WithChildren: Story = {
  render: (args) => {
    const [open, setOpen] = React.useState(true);
    return (
      <div>
        <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Open Modal
        </button>
        <Modal {...args} open={open} onOpenChange={setOpen}>
          <div style={{ padding: '16px 0' }}>
            <p style={{ marginBottom: '8px', fontWeight: 600 }}>Summary</p>
            <ul style={{ listStyle: 'disc', paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>3 students will be enrolled</li>
              <li>Academic year: 2025–2026</li>
              <li>Class: Year 7 — Group A</li>
            </ul>
          </div>
        </Modal>
      </div>
    );
  },
  args: {
    title: 'Review Enrolment',
    confirmLabel: 'Enrol Students',
    cancelLabel: 'Go Back',
    onConfirm: () => undefined,
    variant: 'default',
    isLoading: false,
  },
};
