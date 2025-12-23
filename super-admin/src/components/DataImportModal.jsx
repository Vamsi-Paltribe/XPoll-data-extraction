import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const DataImportModal = ({ bucket, onClose }) => {
    const queryClient = useQueryClient();
    const [file, setFile] = useState(null);
    const [uploadStats, setUploadStats] = useState(null);

    const uploadMutation = useMutation({
        mutationFn: async (formData) => {
            const res = await api.post(`/admin/buckets/${bucket._id}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return res.data;
        },
        onSuccess: (data) => {
            setUploadStats(data);
            queryClient.invalidateQueries({ queryKey: ['admin-bucket-records', bucket._id] });
            queryClient.invalidateQueries({ queryKey: ['admin-user-buckets'] });
        },
        onError: (err) => {
            alert(err.response?.data?.error || 'Upload failed');
        }
    });

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
            setUploadStats(null);
        }
    };

    const handleUpload = () => {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        uploadMutation.mutate(formData);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Import Data</h3>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                            Target: {bucket.name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {!uploadStats ? (
                    <div className="space-y-6">
                        <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center hover:border-slate-400 hover:bg-slate-50 transition-all group cursor-pointer relative">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />

                            {file ? (
                                <>
                                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4">
                                        <FileText className="w-8 h-8" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-900">{file.name}</p>
                                    <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-white group-hover:scale-110 transition-all shadow-sm">
                                        <Upload className="w-8 h-8" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-900">Click to Upload CSV</p>
                                    <p className="text-xs text-slate-400 mt-2 max-w-[200px]">
                                        Support for standard CSV format. First row must be headers.
                                    </p>
                                </>
                            )}
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={!file || uploadMutation.isPending}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {uploadMutation.isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {uploadMutation.isPending ? 'Processing...' : 'Start Ingestion'}
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10" />
                        </div>
                        <h4 className="text-xl font-bold text-slate-900 mb-2">Import Complete</h4>
                        <p className="text-slate-500 text-sm mb-8">
                            Successfully processed data file.
                        </p>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="p-4 bg-slate-50 rounded-2xl">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Received</p>
                                <p className="text-xl font-bold text-slate-900">{uploadStats.totalReceived}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-2xl">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase">Upserted</p>
                                <p className="text-xl font-bold text-emerald-700">{uploadStats.upserted}</p>
                            </div>
                            <div className="p-4 bg-red-50 rounded-2xl">
                                <p className="text-[10px] font-bold text-red-500 uppercase">Errors</p>
                                <p className="text-xl font-bold text-red-600">{uploadStats.errors}</p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-full py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataImportModal;
