'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  toast,
} from '@school/ui';
import { apiClient } from '@/lib/api-client';

interface Student {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  status: string;
}

interface Parent {
  id: string;
  first_name: string;
  last_name: string;
}

interface SplitEmergencyContact {
  contact_name: string;
  phone: string;
  relationship_label: string;
}

interface SplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentHouseholdId: string;
  students: Student[];
  parents: Parent[];
  onSplit: (newHouseholdId: string) => void;
}

export function SplitDialog({
  open,
  onOpenChange,
  currentHouseholdId,
  students,
  parents,
  onSplit,
}: SplitDialogProps) {
  const [newHouseholdName, setNewHouseholdName] = React.useState('');
  const [selectedStudents, setSelectedStudents] = React.useState<Set<string>>(new Set());
  const [selectedParents, setSelectedParents] = React.useState<Set<string>>(new Set());
  const [emergencyContacts, setEmergencyContacts] = React.useState<SplitEmergencyContact[]>([
    { contact_name: '', phone: '', relationship_label: '' },
  ]);
  const [isSplitting, setIsSplitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Reset state on open
  React.useEffect(() => {
    if (open) {
      setNewHouseholdName('');
      setSelectedStudents(new Set());
      setSelectedParents(new Set());
      setEmergencyContacts([{ contact_name: '', phone: '', relationship_label: '' }]);
      setErrors({});
    }
  }, [open]);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleParent = (id: string) => {
    setSelectedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setContactField = (
    index: number,
    field: keyof SplitEmergencyContact,
    value: string,
  ) => {
    setEmergencyContacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const addContact = () => {
    if (emergencyContacts.length >= 3) return;
    setEmergencyContacts((prev) => [
      ...prev,
      { contact_name: '', phone: '', relationship_label: '' },
    ]);
  };

  const removeContact = (index: number) => {
    if (emergencyContacts.length <= 1) return;
    setEmergencyContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!newHouseholdName.trim()) newErrors.household_name = 'Household name is required';
    if (selectedStudents.size === 0 && selectedParents.size === 0) {
      newErrors.selection = 'Select at least one student or parent to split';
    }
    emergencyContacts.forEach((c, i) => {
      if (!c.contact_name.trim()) newErrors[`ec_${i}_name`] = 'Required';
      if (!c.phone.trim()) newErrors[`ec_${i}_phone`] = 'Required';
      if (!c.relationship_label.trim()) newErrors[`ec_${i}_rel`] = 'Required';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSplit = async () => {
    if (!validate()) return;
    setIsSplitting(true);
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/households/split', {
        method: 'POST',
        body: JSON.stringify({
          source_household_id: currentHouseholdId,
          new_household_name: newHouseholdName,
          student_ids: Array.from(selectedStudents),
          parent_ids: Array.from(selectedParents),
          emergency_contacts: emergencyContacts.map((c, i) => ({
            ...c,
            display_order: i + 1,
          })),
        }),
      });
      toast.success('Household split successfully');
      onOpenChange(false);
      onSplit(res.data.id);
    } catch {
      toast.error('Failed to split household');
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Household</DialogTitle>
          <DialogDescription>
            Create a new household by moving selected students and parents from this one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* New household name */}
          <div className="space-y-1.5">
            <Label htmlFor="split_name">New Household Name *</Label>
            <Input
              id="split_name"
              value={newHouseholdName}
              onChange={(e) => setNewHouseholdName(e.target.value)}
              placeholder="e.g. The Smith Family"
            />
            {errors.household_name && (
              <p className="text-xs text-danger-text">{errors.household_name}</p>
            )}
          </div>

          {errors.selection && (
            <p className="text-xs text-danger-text">{errors.selection}</p>
          )}

          {/* Students */}
          {students.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-text-primary">Students to move</p>
              {students.map((student) => (
                <div key={student.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`split_student_${student.id}`}
                    checked={selectedStudents.has(student.id)}
                    onCheckedChange={() => toggleStudent(student.id)}
                  />
                  <Label htmlFor={`split_student_${student.id}`} className="cursor-pointer">
                    {student.full_name || `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim()}
                  </Label>
                </div>
              ))}
            </div>
          )}

          {/* Parents */}
          {parents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-text-primary">Parents to move</p>
              {parents.map((parent) => (
                <div key={parent.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`split_parent_${parent.id}`}
                    checked={selectedParents.has(parent.id)}
                    onCheckedChange={() => toggleParent(parent.id)}
                  />
                  <Label htmlFor={`split_parent_${parent.id}`} className="cursor-pointer">
                    {parent.first_name} {parent.last_name}
                  </Label>
                </div>
              ))}
            </div>
          )}

          {/* Emergency contacts for new household */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">
                Emergency Contacts for New Household *
              </p>
              {emergencyContacts.length < 3 && (
                <Button type="button" variant="outline" size="sm" onClick={addContact}>
                  <Plus className="me-1 h-3.5 w-3.5" />
                  Add
                </Button>
              )}
            </div>

            {emergencyContacts.map((contact, index) => (
              <div
                key={index}
                className="rounded-xl border border-border p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Contact {index + 1}
                  </span>
                  {emergencyContacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeContact(index)}
                      className="text-text-tertiary hover:text-danger-text"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={contact.contact_name}
                      onChange={(e) => setContactField(index, 'contact_name', e.target.value)}
                    />
                    {errors[`ec_${index}_name`] && (
                      <p className="text-xs text-danger-text">{errors[`ec_${index}_name`]}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input
                      dir="ltr"
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => setContactField(index, 'phone', e.target.value)}
                    />
                    {errors[`ec_${index}_phone`] && (
                      <p className="text-xs text-danger-text">{errors[`ec_${index}_phone`]}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Relationship</Label>
                  <Input
                    value={contact.relationship_label}
                    onChange={(e) => setContactField(index, 'relationship_label', e.target.value)}
                  />
                  {errors[`ec_${index}_rel`] && (
                    <p className="text-xs text-danger-text">{errors[`ec_${index}_rel`]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isSplitting} onClick={() => void handleSplit()}>
            {isSplitting ? 'Splitting...' : 'Confirm Split'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
