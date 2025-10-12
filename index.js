$(document).ready(function() {
    const csvFilePath = '사양견적관리.csv';
    const db = {}; // 데이터를 저장할 전역 객체

    // 1. CSV 데이터 로드 및 파싱 (최초 1회)
    async function loadData() {
        try {
            const response = await fetch(csvFilePath);
            const csvText = await response.text();
            parseCSV(csvText);
            precomputeHashes(); // 스펙 해시 계산 호출
            // 데이터 로드 후 첫 페이지 로드
            loadInitialPage();
        } catch (error) {
            console.error("데이터 로딩 실패:", error);
            alert("기준 데이터 파일을 불러오는 데 실패했습니다.");
        }
    }

    function parseCSV(csvText) {
        // Helper function to correctly parse a single CSV line, handling commas within quotes.
        function parseCsvLine(row) {
            const quoted = /"[^"]+"/g;
            const COMMA_REPLACEMENT = '##COMMA##'; // A unique string to temporarily replace commas

            // Temporarily replace commas inside quoted fields
            const tempRow = row.replace(quoted, (match) => {
                return match.replace(/,/g, COMMA_REPLACEMENT);
            });

            // Split the row by commas
            const columns = tempRow.split(',');

            // Restore the commas in the fields and remove the quotes
            return columns.map((col) => {
                return col.replace(/"/g, '').replace(new RegExp(COMMA_REPLACEMENT, 'g'), ',').trim();
            });
        }

        let currentTableName = null, headers = [];
        const lines = csvText.split(/\r\n|\n/).map(line => line.trim());
        
        for (const line of lines) {
            if (!line.trim()) { currentTableName = null; headers = []; continue; }
            
            // Use the new, more robust CSV line parser
            const columns = parseCsvLine(line);

            const potentialTableName = columns[0];
            const isTableDefinition = columns.length > 1 && columns.slice(1).every(c => c === '');

            if (isTableDefinition) {
                currentTableName = potentialTableName;
                db[currentTableName] = []; // 새 테이블 초기화
                headers = [];
                continue;
            }

            if (currentTableName) {
                if (headers.length === 0) {
                    headers = columns.filter(h => h);
                } else {
                    const record = {};
                    headers.forEach((h, i) => { if (columns[i]) record[h] = columns[i]; });
                    if (Object.keys(record).length > 0) db[currentTableName].push(record);
                }
            }
        }
        console.log("중앙 데이터 파싱 완료:", db);
    }

    // 스펙 해시 미리 계산
    function precomputeHashes() {
        db.unitSpecHashes = {};
        if (!db.유닛품번리스트 || !db.유닛품번스펙정보) return;

        db.유닛품번리스트.forEach(part => {
            const specs = db.유닛품번스펙정보
                .filter(s => String(s.유닛품번코드) === String(part.유닛품번코드))
                .map(s => s.스펙코드)
                .sort()
                .join('-');
            if (specs) {
                db.unitSpecHashes[part.유닛품번코드] = specs;
            }
        });
        console.log("스펙 해시 계산 완료:", db.unitSpecHashes);
    }

    // 2. 네비게이션 이벤트 핸들러
    // GNB 메뉴 클릭
    $('.gnb-item').on('click', function() {
        const menu = $(this).data('menu');

        // GNB 활성 상태 변경
        $('.gnb-item').removeClass('active');
        $(this).addClass('active');

        // LNB 메뉴 변경
        $('.lnb-menu').removeClass('active');
        $(`#lnb-${menu}`).addClass('active');

        // 해당 LNB의 첫 번째 메뉴를 기본으로 로드
        $(`#lnb-${menu} li:first`).click();
    });

    // LNB 메뉴 클릭
    $('.lnb li').on('click', function() {
        const pageSrc = $(this).data('src');
        if (!pageSrc) return;

        // LNB 활성 상태 변경
        $('.lnb li').removeClass('active');
        $(this).addClass('active');

        // Iframe에 페이지 로드
        $('iframe[name="content-frame"]').attr('src', pageSrc);
    });

    $('#lnb-toggle-btn').on('click', function() {
        $('.container').toggleClass('lnb-collapsed');
    });

    // 3. Iframe 로드 완료 후 데이터 전달
    $('iframe[name="content-frame"]').on('load', function() {
        const iframe = this;
        // iframe 내부 페이지에 db 객체 전달 및 초기화 함수 호출
        if (iframe.contentWindow) {
            iframe.contentWindow.db = db;
            if (typeof iframe.contentWindow.initializePage === 'function') {
                iframe.contentWindow.initializePage(db);
            }
        }
    });

    // 4. 초기화
    function loadInitialPage() {
        // 첫 번째 GNB 메뉴의 첫 번째 LNB 메뉴를 클릭
        $('.gnb-item[data-menu="spec"]').click();
    }

    loadData(); // 시작!
});
