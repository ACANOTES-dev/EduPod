'use client';

import { Button, Input, Label } from '@school/ui';
import { Eraser, PenLine, Type } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

import type { SignatureValue } from './engagement-types';

interface ESignaturePadProps {
  legalText: string;
  locale: string;
  value: SignatureValue | null;
  onChange: (value: SignatureValue | null) => void;
  disabled?: boolean;
}

function buildTypedSignatureData(name: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 280;
  const context = canvas.getContext('2d');

  if (!context) {
    return '';
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0f172a';
  context.font = '54px serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL('image/png');
}

export function ESignaturePad({
  legalText,
  locale,
  value,
  onChange,
  disabled = false,
}: ESignaturePadProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = React.useState<'drawn' | 'typed'>(value?.type ?? 'drawn');
  const [typedName, setTypedName] = React.useState(value?.typed_name ?? '');
  const [hasInk, setHasInk] = React.useState(Boolean(value && value.type === 'drawn'));

  const configureCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();

    canvas.width = Math.floor(bounds.width * ratio);
    canvas.height = Math.floor(bounds.height * ratio);

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.scale(ratio, ratio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.5;
    context.strokeStyle = '#0f172a';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, bounds.width, bounds.height);
  }, []);

  React.useEffect(() => {
    configureCanvas();
    const handleResize = () => configureCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [configureCanvas]);

  React.useEffect(() => {
    if (mode !== 'typed') {
      return;
    }

    if (!typedName.trim()) {
      onChange(null);
      return;
    }

    onChange({
      type: 'typed',
      data: buildTypedSignatureData(typedName.trim()),
      timestamp: new Date().toISOString(),
      legal_text_version: legalText,
      typed_name: typedName.trim(),
    });
  }, [legalText, mode, onChange, typedName]);

  const getCanvasPoint = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();

    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }, []);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || mode !== 'drawn') {
        return;
      }

      const context = canvasRef.current?.getContext('2d');
      const point = getCanvasPoint(event);

      if (!context || !point) {
        return;
      }

      isDrawingRef.current = true;
      lastPointRef.current = point;
      context.beginPath();
      context.moveTo(point.x, point.y);
    },
    [disabled, getCanvasPoint, mode],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || disabled || mode !== 'drawn') {
        return;
      }

      const context = canvasRef.current?.getContext('2d');
      const point = getCanvasPoint(event);

      if (!context || !point) {
        return;
      }

      context.lineTo(point.x, point.y);
      context.stroke();
      lastPointRef.current = point;
      setHasInk(true);
    },
    [disabled, getCanvasPoint, mode],
  );

  const finishDrawing = React.useCallback(() => {
    if (!isDrawingRef.current || disabled || mode !== 'drawn') {
      return;
    }

    isDrawingRef.current = false;

    const data = canvasRef.current?.toDataURL('image/png') ?? '';

    if (!data) {
      return;
    }

    onChange({
      type: 'drawn',
      data,
      timestamp: new Date().toISOString(),
      legal_text_version: legalText,
    });
  }, [disabled, legalText, mode, onChange]);

  const clearSignature = React.useCallback(() => {
    configureCanvas();
    setHasInk(false);
    setTypedName('');
    onChange(null);
  }, [configureCanvas, onChange]);

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-surface p-4">
      <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">
          {locale === 'ar' ? 'إقرار التوقيع' : 'Signature declaration'}
        </p>
        <p className="mt-1 leading-6">{legalText}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={mode === 'drawn' ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => setMode('drawn')}
        >
          <PenLine className="me-2 h-4 w-4" />
          {locale === 'ar' ? 'ارسم التوقيع' : 'Draw signature'}
        </Button>
        <Button
          type="button"
          variant={mode === 'typed' ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => setMode('typed')}
        >
          <Type className="me-2 h-4 w-4" />
          {locale === 'ar' ? 'اكتب الاسم' : 'Type your name'}
        </Button>
        <Button type="button" variant="ghost" disabled={disabled} onClick={clearSignature}>
          <Eraser className="me-2 h-4 w-4" />
          {locale === 'ar' ? 'مسح' : 'Clear'}
        </Button>
      </div>

      {mode === 'drawn' ? (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            className="h-48 w-full touch-none rounded-2xl border border-dashed border-border bg-white"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrawing}
            onPointerLeave={finishDrawing}
          />
          <p className="text-xs text-text-tertiary">
            {hasInk
              ? locale === 'ar'
                ? 'تم التقاط التوقيع.'
                : 'Signature captured.'
              : locale === 'ar'
                ? 'استخدم إصبعك أو القلم أو الفأرة للتوقيع.'
                : 'Use touch, stylus, or mouse to sign.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="typed-signature">
            {locale === 'ar' ? 'الاسم القانوني الكامل' : 'Full legal name'}
          </Label>
          <Input
            id="typed-signature"
            value={typedName}
            disabled={disabled}
            onChange={(event) => setTypedName(event.target.value)}
            className="min-h-12 text-base"
            placeholder={locale === 'ar' ? 'اكتب اسمك الكامل' : 'Type your full name'}
          />
          {value?.type === 'typed' && value.data ? (
            <Image
              src={value.data}
              alt={locale === 'ar' ? 'معاينة التوقيع' : 'Signature preview'}
              width={280}
              height={112}
              unoptimized
              className="h-28 rounded-2xl border border-border bg-white object-contain p-4"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
