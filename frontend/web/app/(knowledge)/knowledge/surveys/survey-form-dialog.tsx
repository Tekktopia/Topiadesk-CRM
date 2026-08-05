'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { SURVEY_TRIGGER_EVENTS, SURVEY_TRIGGER_EVENT_LABEL, SURVEY_TYPES, SURVEY_TYPE_LABEL } from '../../_lib/constants';
import { useCreateSurvey, useUpdateSurvey } from '../../_lib/queries';
import type { Survey, SurveyTriggerEvent, SurveyType } from '../../_lib/types';

export function SurveyFormDialog({ target, open, onOpenChange }: { target: 'create' | Survey; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [type, setType] = useState<SurveyType>('CSAT');
  const [triggerEvent, setTriggerEvent] = useState<SurveyTriggerEvent>('CASE_RESOLVED');
  const [questionText, setQuestionText] = useState('');
  const [scaleMin, setScaleMin] = useState('0');
  const [scaleMax, setScaleMax] = useState('5');
  const [sendDelayMinutes, setSendDelayMinutes] = useState('0');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setType(target.type);
      setTriggerEvent(target.triggerEvent);
      setQuestionText(target.questionText);
      setScaleMin(String(target.scaleMin));
      setScaleMax(String(target.scaleMax));
      setSendDelayMinutes(String(target.sendDelayMinutes));
      setIsActive(target.isActive);
    } else {
      setName('');
      setType('CSAT');
      setTriggerEvent('CASE_RESOLVED');
      setQuestionText('');
      setScaleMin('0');
      setScaleMax('5');
      setSendDelayMinutes('0');
      setIsActive(true);
    }
  }, [target, isEdit]);

  const createMutation = useCreateSurvey();
  const updateMutation = useUpdateSurvey(isEdit ? target.id : '');
  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      type,
      triggerEvent,
      questionText,
      scaleMin: Number.parseInt(scaleMin, 10) || 0,
      scaleMax: Number.parseInt(scaleMax, 10) || 1,
      sendDelayMinutes: Number.parseInt(sendDelayMinutes, 10) || 0,
      isActive,
    };
    if (isEdit) {
      updateMutation.mutate(body, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(body, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.name}` : 'New survey'}</DialogTitle>
          <DialogDescription>Defines a CSAT / NPS / CES survey dispatched on a trigger event. Requires the Survey (write) grant.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="survey-name">Name</Label>
            <Input id="survey-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={150} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SurveyType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURVEY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SURVEY_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trigger event</Label>
              <Select value={triggerEvent} onValueChange={(v) => setTriggerEvent(v as SurveyTriggerEvent)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURVEY_TRIGGER_EVENTS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SURVEY_TRIGGER_EVENT_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="survey-question">Question text</Label>
            <Input
              id="survey-question"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="e.g. How satisfied were you with how your case was handled?"
              required
              minLength={1}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="survey-scale-min">Scale min</Label>
              <Input id="survey-scale-min" type="number" value={scaleMin} onChange={(e) => setScaleMin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="survey-scale-max">Scale max</Label>
              <Input id="survey-scale-max" type="number" min={1} value={scaleMax} onChange={(e) => setScaleMax(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="survey-delay">Send delay (min)</Label>
              <Input id="survey-delay" type="number" min={0} value={sendDelayMinutes} onChange={(e) => setSendDelayMinutes(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 pt-1 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !questionText.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create survey'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
