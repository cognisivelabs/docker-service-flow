export function downloadJSON(data: any, filename: string) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
}

export function downloadSVG(svgElement: SVGSVGElement, filename: string) {
    // Serialize the SVG
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    // Add XML declaration
    if (!source.match(/^<\\?xml/)) {
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    }

    // Ensure namespace is present
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
}

export function downloadPNG(svgElement: SVGSVGElement, filename: string) {
    // 1. Serialize SVG
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);

    // 2. Create an image to render the SVG
    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        // 3. Create Canvas
        const canvas = document.createElement('canvas');
        // Get strict dimensions
        const bbox = svgElement.getBoundingClientRect();
        canvas.width = bbox.width;
        canvas.height = bbox.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // White background (otherwise transparency might be black/white depending on viewer)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image
        ctx.drawImage(img, 0, 0);

        // 4. Download
        const pngUrl = canvas.toDataURL('image/png');
        triggerDownload(pngUrl, filename);

        URL.revokeObjectURL(url);
    };

    img.src = url;
}

function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
