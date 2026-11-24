'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import { useSkills } from '@/lib/hooks/use-caregivers';
import { useTranslation } from '@/lib/i18n/provider';
import { useAuth } from '@/lib/api/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Skill } from '@/lib/api/types';

type SkillForm = { name: string; nameSi: string; nameTa: string; category: string; categorySi: string; categoryTa: string };

const EMPTY: SkillForm = { name: '', nameSi: '', nameTa: '', category: '', categorySi: '', categoryTa: '' };

const toForm = (s: Skill): SkillForm => ({
  name: s.nameEn ?? s.name,
  nameSi: s.nameSi ?? '',
  nameTa: s.nameTa ?? '',
  category: s.categoryEn ?? s.category ?? '',
  categorySi: s.categorySi ?? '',
  categoryTa: s.categoryTa ?? '',
});

/**
 * Settings > Skills & languages: the skills caregivers are matched on, with
 * their Sinhala and Tamil names. A skill shows in English wherever a
 * translation is missing, and the list says which are missing so they can be
 * filled in. Everyone in the staff app can see the list; only admins can add
 * or edit (the API agrees).
 */
export function SkillsSection() {
  const { t } = useTranslation();
  const isAdmin = useAuth().user?.role === 'ADMIN';
  const { data: skills, isLoading } = useSkills();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY);

  const save = useMutation({
    mutationFn: () => (editingId ? api.patch(`/skills/${editingId}`, form) : api.post('/skills', form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setEditingId(null);
      setForm(EMPTY);
    },
  });

  const startEdit = (s: Skill) => {
    save.reset();
    setEditingId(s.id);
    setForm(toForm(s));
  };
  const cancel = () => {
    save.reset();
    setEditingId(null);
    setForm(EMPTY);
  };
  const field = (key: keyof SkillForm) => ({
    id: `skill-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <section id="skills" className="scroll-mt-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t('nav.skills')}</h2>
      <p className="mb-4 text-sm text-ink/60">{t('skillsAdmin.subtitle')}</p>
      <div className={isAdmin ? 'grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]' : 'max-w-2xl'}>
        <Card>
          <CardContent className="divide-y divide-border py-0">
            {isLoading && <p className="py-5 text-sm text-ink/50">{t('common.loading')}</p>}
            {skills?.map((s) => {
              const missing = [!s.nameSi?.trim() && 'si', !s.nameTa?.trim() && 'ta'].filter(Boolean) as string[];
              return (
                <div key={s.id} className="flex items-start justify-between gap-3 py-3 first:pt-5 last:pb-5">
                  <div className="min-w-0">
                    <div className="text-sm text-ink">{s.name}</div>
                    <div className="mt-0.5 text-xs text-ink/50">
                      {[s.nameEn, s.nameSi, s.nameTa].filter((n, i, all) => n && n !== s.name && all.indexOf(n) === i).join(' · ')}
                    </div>
                    {missing.length > 0 && (
                      <div className="mt-1 text-xs text-accent">
                        {t('skillsAdmin.missing', { languages: missing.map((l) => t(`skillsAdmin.languageName.${l}`)).join(', ') })}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {s.category && <span className="text-xs text-ink/40">{s.category}</span>}
                    {isAdmin && (
                      <button type="button" onClick={() => startEdit(s)} className="text-xs font-medium text-brand-dark hover:underline">
                        {t('common.edit')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardContent className="space-y-3 py-5">
              <h3 className="text-sm font-semibold text-ink">{editingId ? t('skillsAdmin.editTitle') : t('skillsAdmin.addTitle')}</h3>
              <div>
                <Label htmlFor="skill-name" required>{t('skillsAdmin.nameEn')}</Label>
                <Input {...field('name')} />
              </div>
              <div>
                <Label htmlFor="skill-nameSi">{t('skillsAdmin.nameSi')}</Label>
                <Input {...field('nameSi')} lang="si" />
              </div>
              <div>
                <Label htmlFor="skill-nameTa">{t('skillsAdmin.nameTa')}</Label>
                <Input {...field('nameTa')} lang="ta" />
              </div>
              <div className="border-t border-border pt-3">
                <Label htmlFor="skill-category">{t('skillsAdmin.categoryEn')}</Label>
                <Input {...field('category')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="skill-categorySi">{t('skillsAdmin.categorySi')}</Label>
                  <Input {...field('categorySi')} lang="si" />
                </div>
                <div>
                  <Label htmlFor="skill-categoryTa">{t('skillsAdmin.categoryTa')}</Label>
                  <Input {...field('categoryTa')} lang="ta" />
                </div>
              </div>
              <p className="text-xs text-ink/50">{t('skillsAdmin.fallbackHint')}</p>
              {save.isError && (
                <p role="alert" className="text-sm text-danger">
                  {save.error instanceof ApiError ? save.error.message : t('common.actionFailed')}
                </p>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
                  {editingId ? t('common.save') : t('common.add')}
                </Button>
                {editingId && (
                  <Button variant="secondary" onClick={cancel}>
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
