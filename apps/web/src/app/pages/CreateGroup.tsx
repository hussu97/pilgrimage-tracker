import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, useFeedback } from '@/app/providers';
import { createGroup, getPlaces, uploadGroupCover } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import PlaceSelector from '@/components/groups/PlaceSelector';
import type { Place } from '@/lib/types';

type Step = 'details' | 'places' | 'review';

export default function CreateGroup() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { showError } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPlaceCodes, setSelectedPlaceCodes] = useState<string[]>([]);

  // Validation
  const [nameError, setNameError] = useState('');

  // Places for selector
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'places' && places.length === 0) {
      setPlacesLoading(true);
      getPlaces({ limit: 200 })
        .then((res) => setPlaces(res.places ?? []))
        .catch(() => {})
        .finally(() => setPlacesLoading(false));
    }
  }, [step, places.length]);

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const goNext = () => {
    if (step === 'details') {
      if (!name.trim()) {
        setNameError(t('groups.nameRequired'));
        return;
      }
      setNameError('');
      setStep('places');
    } else if (step === 'places') {
      setStep('review');
    }
  };

  const goBack = () => {
    if (step === 'places') setStep('details');
    else if (step === 'review') setStep('places');
    else navigate(-1);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      let finalCoverUrl = coverImageUrl.trim() || undefined;

      // Upload cover image if a file was selected
      if (coverFile) {
        setCoverUploading(true);
        try {
          const result = await uploadGroupCover(coverFile);
          finalCoverUrl = result.url;
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('common.error');
          setError(msg);
          showError(t('feedback.error'));
          setSubmitting(false);
          setCoverUploading(false);
          return;
        }
        setCoverUploading(false);
      }

      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
        path_place_codes: selectedPlaceCodes.length > 0 ? selectedPlaceCodes : undefined,
        cover_image_url: finalCoverUrl,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setInviteCode(g.invite_code);
      setGroupCode(g.group_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      showError(t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (inviteCode && groupCode) {
    const inviteUrlFull = `${window.location.origin}/join?code=${inviteCode}`;
    return (
      <div className="max-w-md mx-auto px-4 py-8 dark:bg-dark-bg min-h-screen">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-primary">check_circle</span>
        </div>
        <h2 className="text-xl font-semibold text-text-main dark:text-white text-center mb-2">
          {t('groups.groupCreated')}
        </h2>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm text-center mb-6">
          {t('groups.shareInviteLink')}
        </p>
        <div className="flex gap-2 mb-4">
          <input
            readOnly
            value={inviteUrlFull}
            className="flex-1 text-sm border border-input-border dark:border-dark-border rounded-xl px-4 py-3 bg-background-light dark:bg-dark-surface text-text-main dark:text-white"
          />
          <button
            type="button"
            onClick={() => shareUrl(t('groups.shareMessage'), inviteUrlFull)}
            className="px-4 py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium shrink-0 hover:bg-soft-blue dark:hover:bg-dark-surface inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined">share</span>
            {t('common.share')}
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteUrlFull)}
            className="px-4 py-3 rounded-xl bg-primary text-white font-medium shrink-0 hover:bg-primary-hover"
          >
            {t('common.copy')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/groups/${groupCode}`)}
          className="w-full py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium hover:bg-soft-blue dark:hover:bg-dark-surface"
        >
          {t('groups.goToGroup')}
        </button>
      </div>
    );
  }

  const steps: Step[] = ['details', 'places', 'review'];
  const stepIndex = steps.indexOf(step);
  const stepLabels: Record<Step, string> = {
    details: t('groups.stepDetails'),
    places: t('groups.stepPlaces'),
    review: t('groups.stepReview'),
  };

  const selectedPlaceObjects = selectedPlaceCodes
    .map((code) => places.find((p) => p.place_code === code))
    .filter(Boolean) as Place[];

  return (
    <div className="max-w-lg mx-auto px-4 py-6 dark:bg-dark-bg min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={goBack}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-dark-surface"
          aria-label={t('common.back')}
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-white">
            arrow_back
          </span>
        </button>
        <h1 className="text-xl font-bold text-text-main dark:text-white">
          {t('groups.createGroup')}
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < stepIndex
                    ? 'bg-primary text-white'
                    : i === stepIndex
                      ? 'bg-primary text-white ring-2 ring-primary/30'
                      : 'bg-slate-200 dark:bg-dark-border text-slate-400'
                }`}
              >
                {i < stepIndex ? (
                  <span className="material-symbols-outlined text-xs">check</span>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs font-semibold ${
                  i === stepIndex ? 'text-primary' : 'text-slate-400 dark:text-dark-text-secondary'
                }`}
              >
                {stepLabels[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 ${
                  i < stepIndex ? 'bg-primary' : 'bg-slate-200 dark:bg-dark-border'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === 'details' && (
        <div className="space-y-4">
          {/* Cover Image Picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleCoverPick}
          />
          {coverPreview ? (
            <div className="relative w-full h-44 rounded-xl overflow-hidden">
              <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white/90 text-slate-700 text-xs font-semibold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  {t('groups.changeCoverPhoto')}
                </button>
                <button
                  type="button"
                  onClick={removeCover}
                  className="px-3 py-1.5 rounded-lg bg-white/90 text-red-600 text-xs font-semibold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                  {t('groups.removeCoverPhoto')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-44 rounded-xl border-2 border-dashed border-slate-300 dark:border-dark-border bg-slate-50 dark:bg-dark-surface flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-3xl text-slate-400 dark:text-dark-text-secondary">
                photo_camera
              </span>
              <span className="text-sm font-medium text-slate-500 dark:text-dark-text-secondary">
                {t('groups.addCoverPhoto')}
              </span>
              <span className="text-xs text-slate-400 dark:text-dark-text-secondary">
                {t('groups.optional')}
              </span>
            </button>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
              {t('groups.nameLabel')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder={t('groups.groupNamePlaceholder')}
              className={`w-full h-12 border rounded-xl px-4 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                nameError
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-input-border dark:border-dark-border'
              }`}
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
              {t('groups.descriptionLabel')} {t('groups.optional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('groups.descriptionPlaceholder')}
              rows={3}
              className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
                {t('groups.startDate')} {t('groups.optional')}
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">
                  calendar_today
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-12 border border-input-border dark:border-dark-border rounded-xl pl-10 pr-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-1.5">
                {t('groups.endDate')} {t('groups.optional')}
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">
                  calendar_today
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-12 border border-input-border dark:border-dark-border rounded-xl pl-10 pr-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 border border-input-border dark:border-dark-border rounded-xl cursor-pointer hover:bg-soft-blue dark:hover:bg-dark-surface">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-input-border text-primary"
            />
            <div>
              <span className="text-text-main dark:text-white text-sm">
                {t('groups.privateGroup')}
              </span>
              <span className="text-xs text-slate-400 dark:text-dark-text-secondary ml-1">
                {t('groups.optional')}
              </span>
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 h-12 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex-1 h-12 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Places */}
      {step === 'places' && (
        <div className="space-y-4">
          <PlaceSelector
            selectedCodes={selectedPlaceCodes}
            onChange={setSelectedPlaceCodes}
            places={places}
            loading={placesLoading}
          />
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={goBack}
              className="flex-1 h-12 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
            >
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex-1 h-12 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="space-y-5">
          <h2 className="text-lg font-bold text-text-main dark:text-white">
            {t('groups.reviewYourGroup')}
          </h2>

          <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-4 space-y-3">
            {coverPreview && (
              <img src={coverPreview} alt={name} className="w-full h-32 object-cover rounded-lg" />
            )}
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">{name}</h3>
              {description && (
                <p className="text-sm text-slate-500 dark:text-dark-text-secondary mt-1">
                  {description}
                </p>
              )}
            </div>
            {(startDate || endDate) && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-dark-text-secondary">
                <span className="material-symbols-outlined text-base">calendar_today</span>
                <span>
                  {startDate} {startDate && endDate ? '–' : ''} {endDate}
                </span>
              </div>
            )}
            {isPrivate && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-dark-text-secondary">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>{t('groups.privateGroup')}</span>
              </div>
            )}
          </div>

          {selectedPlaceObjects.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-600 dark:text-dark-text-secondary mb-2">
                {t('groups.placesInItinerary').replace(
                  '{count}',
                  String(selectedPlaceObjects.length),
                )}
              </p>
              <ol className="space-y-1">
                {selectedPlaceObjects.map((place, i) => (
                  <li
                    key={place.place_code}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-dark-surface border border-slate-100 dark:border-dark-border"
                  >
                    <span className="text-xs font-bold text-primary w-5 text-center">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-white">
                        {place.name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-dark-text-secondary">
                        {place.religion}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={goBack}
              className="flex-1 h-12 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
            >
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || coverUploading}
              className="flex-1 h-12 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting || coverUploading ? t('common.loading') : t('groups.createAndInvite')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
