import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import { TableWrapper } from './table-wrapper';

const meta: Meta<typeof TableWrapper> = {
  title: 'Components/TableWrapper',
  component: TableWrapper,
  tags: ['autodocs'],
  argTypes: {
    toolbar: { control: false },
    pagination: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof TableWrapper>;

const SampleTable = () => (
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
    <thead>
      <tr style={{ borderBottom: '1px solid #E7E5E4' }}>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#78716C', fontWeight: 500 }}>
          Name
        </th>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#78716C', fontWeight: 500 }}>
          Year
        </th>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#78716C', fontWeight: 500 }}>
          Status
        </th>
      </tr>
    </thead>
    <tbody>
      {['Ahmed Al-Rashid', 'Sara Benali', 'Omar Idrissi'].map((name, i) => (
        <tr key={name} style={{ borderBottom: i < 2 ? '1px solid #E7E5E4' : undefined }}>
          <td style={{ padding: '12px 16px', color: '#1C1917' }}>{name}</td>
          <td style={{ padding: '12px 16px', color: '#78716C' }}>Year {i + 7}</td>
          <td style={{ padding: '12px 16px', color: '#065F46' }}>Active</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Toolbar = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <input
      type="search"
      placeholder="Search students…"
      style={{
        padding: '6px 12px',
        border: '1px solid #E7E5E4',
        borderRadius: '6px',
        fontSize: '14px',
      }}
    />
    <button
      style={{
        padding: '6px 16px',
        background: '#059669',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
      }}
    >
      Add Student
    </button>
  </div>
);

const Pagination = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '13px',
      color: '#78716C',
    }}
  >
    <span>Showing 1–3 of 3</span>
    <div style={{ display: 'flex', gap: '4px' }}>
      <button
        style={{
          padding: '4px 10px',
          border: '1px solid #E7E5E4',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Prev
      </button>
      <button
        style={{
          padding: '4px 10px',
          border: '1px solid #E7E5E4',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Next
      </button>
    </div>
  </div>
);

export const Default: Story = {
  args: {
    children: <SampleTable />,
  },
};

export const WithToolbar: Story = {
  args: {
    toolbar: <Toolbar />,
    children: <SampleTable />,
  },
};

export const WithPagination: Story = {
  args: {
    children: <SampleTable />,
    pagination: <Pagination />,
  },
};

export const FullFeatured: Story = {
  args: {
    toolbar: <Toolbar />,
    children: <SampleTable />,
    pagination: <Pagination />,
  },
};
