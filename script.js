document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================
    // MOBILE MENU
    // =========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });
        
        // Close menu on link click
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // =========================================
    // FAQ ACCORDION
    // =========================================
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isActive = question.classList.contains('active');
            
            // Close all others
            document.querySelectorAll('.faq-question').forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.style.maxHeight = null;
            });
            
            // Toggle current
            if (!isActive) {
                question.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    // =========================================
    // PLAYGROUND LOGIC (BACKEND INTEGRATION)
    // =========================================
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewImage = document.getElementById('preview-image');
    const uploadContent = document.querySelector('.upload-content');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');
    
    const resultContainer = document.getElementById('result-container');
    const resultPlaceholder = document.querySelector('.result-placeholder');
    const resultFinal = document.getElementById('result-final');
    const loadingState = document.getElementById('loading-state');
    const resultStatus = document.getElementById('result-status');

    // --- GLOBAL STATE ---
    let currentUploadedUrl = null;

    // --- API HELPER FUNCTIONS ---

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Get or create persistent User ID to prevent DRY violation and rate-limit issues
    function getUserId() {
        const KEY = 'mugshot_app_user_id';
        try {
            let uid = localStorage.getItem(KEY);
            if (!uid) {
                uid = generateNanoId(28);
                localStorage.setItem(KEY, uid);
            }
            return uid;
        } catch (e) {
            // Fallback if localStorage is unavailable
            return generateNanoId(28);
        }
    }

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        // Configuration
        const isVideo = false; // Model is 'image-effects'
        const endpoint = 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: 'mugshot',
            imageUrl: imageUrl,
            userId: getUserId(), // Use dynamic session ID
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        const USER_ID = getUserId(); // Use same dynamic session ID
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 60;
        const baseUrl = 'https://api.chromastudio.ai/image-gen';
        
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out');
    }

    // --- UI HELPER FUNCTIONS ---

    function updateStatus(text) {
        if (resultStatus) {
            resultStatus.textContent = text;
            if (text.includes('PROCESSING') || text.includes('UPLOADING')) {
                resultStatus.style.color = 'var(--primary)';
            } else if (text === 'COMPLETE' || text === 'READY') {
                resultStatus.style.color = 'var(--accent)';
            } else if (text === 'ERROR') {
                resultStatus.style.color = '#ef4444';
            }
        }
    }

    function showLoading() {
        if (loadingState) loadingState.classList.remove('hidden');
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (resultFinal) resultFinal.classList.add('hidden');
    }

    function hideLoading() {
        if (loadingState) loadingState.classList.add('hidden');
    }

    function showError(msg) {
        alert('Error: ' + msg);
    }

    // --- MAIN HANDLERS ---

    async function handleFileSelect(file) {
        if (!file) return;

        try {
            updateStatus('UPLOADING...');
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Uploading...';
            }

            // Upload to API
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Update Preview
            if (previewImage) {
                previewImage.src = uploadedUrl;
                previewImage.classList.remove('hidden');
            }
            if (uploadContent) {
                uploadContent.classList.add('hidden');
            }
            
            updateStatus('READY');
            
            // Enable Controls
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = 'GENERATE MUGSHOT';
            }
            if (resetBtn) resetBtn.disabled = false;
            
        } catch (error) {
            console.error('Upload error:', error);
            updateStatus('ERROR');
            showError(error.message);
            if (generateBtn) {
                generateBtn.textContent = 'GENERATE MUGSHOT';
                generateBtn.disabled = true;
            }
        }
    }

    async function handleGenerate() {
        if (!currentUploadedUrl) return;
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            if (generateBtn) generateBtn.disabled = true;
            
            // 1. Submit Job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // 2. Poll for Result
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.image || resultItem?.video;
            
            if (!resultUrl) throw new Error('No image URL in response');
            
            // 4. Update UI
            if (resultFinal) {
                resultFinal.src = resultUrl;
                resultFinal.classList.remove('hidden');
                // Store URL for download logic
                downloadBtn.dataset.url = resultUrl; 
            }
            
            updateStatus('BOOKING COMPLETE'); // Matches original design text
            hideLoading();
            
            if (downloadBtn) downloadBtn.disabled = false;
            if (generateBtn) generateBtn.disabled = false;
            
        } catch (error) {
            console.error('Generation error:', error);
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
            if (generateBtn) generateBtn.disabled = false;
        }
    }

    // --- EVENT LISTENERS ---

    // File Input
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleFileSelect(e.target.files[0]);
        });
    }

    // Drag & Drop
    if (uploadZone) {
        uploadZone.addEventListener('click', () => fileInput && fileInput.click());
        
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleGenerate();
        });
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentUploadedUrl = null;
            
            if (fileInput) fileInput.value = '';
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
            }
            if (uploadContent) uploadContent.classList.remove('hidden');
            
            if (resultFinal) {
                resultFinal.classList.add('hidden');
                resultFinal.src = '';
            }
            if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
            if (loadingState) loadingState.classList.add('hidden');
            
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.dataset.url = '';
            }
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'GENERATE MUGSHOT';
            }
            resetBtn.disabled = true;
            
            updateStatus('NO DATA');
            if (resultStatus) resultStatus.style.color = 'inherit';
        });
    }

    // Robust Download Handler
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            try {
                const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
                if (!response.ok) throw new Error('Network error');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'mugshot_result_' + generateNanoId(6) + '.jpg';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            } catch (err) {
                console.error('Download fallback:', err);
                // Fallback: Open in new tab
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // =========================================
    // MODALS (Keep existing logic)
    // =========================================
    const openModalButtons = document.querySelectorAll('[data-modal-target]');
    const closeModalButtons = document.querySelectorAll('[data-modal-close]');
    
    function openModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }
    
    function closeModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }
    
    openModalButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const target = button.getAttribute('data-modal-target');
            openModal(target);
        });
    });
    
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-modal-close');
            closeModal(target);
        });
    });
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
});