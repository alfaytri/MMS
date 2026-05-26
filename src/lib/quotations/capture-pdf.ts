import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Waits for all <img> tags within a given element to fully load.
 * Prevents html2canvas from capturing blank spaces for remote images (e.g., logos, stamps).
 */
async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'))

  const promises = images.map((img) => {
    // If the browser has already loaded the image, resolve immediately
    if (img.complete) return Promise.resolve()

    return new Promise<void>((resolve) => {
      // Resolve on both load and error so we don't hang indefinitely on broken links
      img.addEventListener('load', () => resolve(), { once: true })
      img.addEventListener('error', () => resolve(), { once: true })
    })
  })

  await Promise.all(promises)
}

/**
 * Capture a DOM element as a PDF blob.
 *
 * Uses html2canvas to render the element to a canvas at 2× pixel density,
 * then converts the canvas to an A4-sized PDF page via jsPDF.
 *
 * @param element — The DOM element to capture (e.g. the QuotationPdfPreview container)
 * @returns A PDF Blob ready for upload
 */
export async function capturePdfBlob(element: HTMLElement): Promise<Blob> {
  // 1. Ensure all images inside the element are fully painted
  await waitForImages(element)

  // 2. Render at 2× for crisp text on retina displays
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,            // allow cross-origin images (logos, stamps)
    logging: false,
    backgroundColor: '#ffffff',
  })

  // 3. Compress output to JPEG (0.8 quality) to keep the PDF payload lightweight
  //    PNG at 2× scale can easily exceed 3MB; JPEG 80% keeps it under 500KB
  const imgData = canvas.toDataURL('image/jpeg', 0.8)

  // A4 dimensions in mm
  const pdfWidth = 210
  const pdfHeight = 297

  // Scale the canvas image to fit A4 width, preserving aspect ratio
  const canvasAspect = canvas.height / canvas.width
  const imgWidth = pdfWidth
  const imgHeight = pdfWidth * canvasAspect

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // If the content is taller than one A4 page, scale down to fit
  if (imgHeight > pdfHeight) {
    const scaledWidth = pdfHeight / canvasAspect
    const xOffset = (pdfWidth - scaledWidth) / 2
    pdf.addImage(imgData, 'JPEG', xOffset, 0, scaledWidth, pdfHeight)
  } else {
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight)
  }

  return pdf.output('blob')
}
