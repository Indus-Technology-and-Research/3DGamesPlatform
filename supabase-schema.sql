-- Educational 3D Platform Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Students/Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    current_grade INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Grades table
CREATE TABLE IF NOT EXISTS public.grades (
    id SERIAL PRIMARY KEY,
    grade_number INTEGER UNIQUE NOT NULL,
    grade_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Subjects table
CREATE TABLE IF NOT EXISTS public.subjects (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    color_theme TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Games table
CREATE TABLE IF NOT EXISTS public.games (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    subject_id INTEGER REFERENCES public.subjects(id) ON DELETE CASCADE,
    grade_id INTEGER REFERENCES public.grades(id) ON DELETE CASCADE,
    thumbnail_url TEXT,
    game_type TEXT, -- 'threejs', 'interactive', etc.
    difficulty_level TEXT, -- 'easy', 'medium', 'hard'
    learning_objectives TEXT[],
    estimated_time INTEGER, -- in minutes
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Student Progress table
CREATE TABLE IF NOT EXISTS public.student_progress (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    game_id INTEGER REFERENCES public.games(id) ON DELETE CASCADE,
    score INTEGER,
    completed BOOLEAN DEFAULT false,
    time_spent INTEGER, -- in seconds
    attempts INTEGER DEFAULT 1,
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, game_id)
);

-- Insert default grades
INSERT INTO public.grades (grade_number, grade_name, description) VALUES
(9, 'Grade 9', 'Freshman year - Foundation building'),
(10, 'Grade 10', 'Sophomore year - Core concepts'),
(11, 'Grade 11', 'Junior year - Advanced topics'),
(12, 'Grade 12', 'Senior year - University preparation')
ON CONFLICT (grade_number) DO NOTHING;

-- Insert default subjects
INSERT INTO public.subjects (name, description, color_theme) VALUES
('Physics', 'Study of matter, energy, and forces', '#3b82f6'),
('Chemistry', 'Study of matter and chemical reactions', '#8b5cf6'),
('Biology', 'Study of living organisms', '#10b981'),
('Mathematics', 'Study of numbers, shapes, and patterns', '#f59e0b')
ON CONFLICT (name) DO NOTHING;

-- Insert sample games
INSERT INTO public.games (title, description, subject_id, grade_id, game_type, difficulty_level, learning_objectives, estimated_time) VALUES
(
    'Molecule Builder 3D',
    'Build and visualize 3D molecular structures of common compounds',
    (SELECT id FROM public.subjects WHERE name = 'Chemistry'),
    (SELECT id FROM public.grades WHERE grade_number = 10),
    'threejs',
    'medium',
    ARRAY['Learn molecular geometry', 'Understand chemical bonds', 'Identify common molecules'],
    15
),
(
    'Projectile Motion Simulator',
    'Learn projectile motion by launching paper balls into a dustbin at various distances',
    (SELECT id FROM public.subjects WHERE name = 'Physics'),
    (SELECT id FROM public.grades WHERE grade_number = 9),
    'threejs',
    'easy',
    ARRAY['Understand projectile motion', 'Apply kinematic equations', 'Visualize parabolic trajectories', 'Calculate launch angle and velocity'],
    15
)
ON CONFLICT DO NOTHING;

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- Students can read their own data
CREATE POLICY "Users can view own student data" ON public.students
    FOR SELECT USING (auth.uid() = id);

-- Students can update their own data
CREATE POLICY "Users can update own student data" ON public.students
    FOR UPDATE USING (auth.uid() = id);

-- Anyone can view active games
CREATE POLICY "Anyone can view active games" ON public.games
    FOR SELECT USING (is_active = true);

-- Anyone can view subjects and grades
CREATE POLICY "Anyone can view subjects" ON public.subjects
    FOR SELECT USING (true);

CREATE POLICY "Anyone can view grades" ON public.grades
    FOR SELECT USING (true);

-- Students can view their own progress
CREATE POLICY "Users can view own progress" ON public.student_progress
    FOR SELECT USING (auth.uid() = student_id);

-- Students can insert their own progress
CREATE POLICY "Users can insert own progress" ON public.student_progress
    FOR INSERT WITH CHECK (auth.uid() = student_id);

-- Students can update their own progress
CREATE POLICY "Users can update own progress" ON public.student_progress
    FOR UPDATE USING (auth.uid() = student_id);

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.students (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create student record on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
