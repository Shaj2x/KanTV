-- One server, two databases: Supabase Auth's and the KanTV backend's.
create database auth;
\c auth
create schema auth;
create database kantv;
