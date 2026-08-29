/**
 * Replace a user's resume file and update the existing resume_profiles row.
 *
 * Behaviour:
 * - If the user has an old resume file, delete it from Supabase Storage.
 * - Upload the new resume to the same profile folder.
 * - Upsert resume_profiles using profile_id so duplicate rows are not created.
 *
 * Required DB protection:
 * - A unique index/constraint on public.resume_profiles(profile_id).
 */
export async function replaceResumeProfile({
  supabase,
  profileId,
  file,
  resumeProfileData = {},
}) {
  if (!supabase) {
    throw new Error('Supabase client is required.');
  }

  if (!profileId) {
    throw new Error('Profile ID is required.');
  }

  if (!file) {
    throw new Error('Resume file is required.');
  }

  const bucket = 'resumes';

  // 1. Check whether this profile already has an uploaded resume.
  const { data: existingProfile, error: fetchError } = await supabase
    .from('resume_profiles')
    .select('id, resume_file_path')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  // 2. Delete the old resume file if it exists.
  if (existingProfile?.resume_file_path) {
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove([existingProfile.resume_file_path]);

    if (removeError) {
      throw removeError;
    }
  }

  // 3. Create the new file path.
  const fileExt = file.name?.split('.').pop()?.toLowerCase() || 'pdf';
  const newFilePath = `${profileId}/master-source.${fileExt}`;

  // 4. Upload the new resume. upsert:true replaces the same path if it already exists.
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(newFilePath, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) {
    throw uploadError;
  }

  // 5. Update the existing resume profile row instead of creating a duplicate.
  const { data, error } = await supabase
    .from('resume_profiles')
    .upsert(
      {
        ...resumeProfileData,
        profile_id: profileId,
        resume_file_path: newFilePath,
        resume_file_name: file.name || null,
        resume_file_type: file.type || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'profile_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    profile: data,
    replacedPreviousResume: Boolean(existingProfile?.resume_file_path),
  };
}

export function getResumeUploadSuccessMessage(replacedPreviousResume) {
  return replacedPreviousResume
    ? 'Previous resume replaced successfully.'
    : 'Resume uploaded successfully.';
}
